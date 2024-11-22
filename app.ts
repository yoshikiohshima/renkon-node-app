import * as http from "node:http";
import * as urlParser from "node:url";
import * as renkon from "renkon-node";
import * as dns from "node:dns";
import * as os from "node:os";

import * as ws from "ws";

process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = "0";

type Timestamp = number // js epoch

type SessionID = string;
type Path = string;

const port:number = 8888;

function randomString() {
    return Math.floor(Math.random() * 36 ** 10).toString(36);
}

class EventServer {
    server?: http.Server;
    session: Session;

    constructor(session:Session) {
        this.session = session;
    }

    handleRequest(request:http.IncomingMessage, response: http.ServerResponse<http.IncomingMessage>) {
        const method = request.method;
        console.log("handleRequest", method);


        const urlObject = urlParser.parse(request.url!, true);
        if (!urlObject.pathname) {
            response.end("not ok");
            return;
        }
        let pathname = decodeURIComponent(urlObject.pathname);
        if (pathname.startsWith("/")) {
            pathname = pathname.slice(1);
        }
        // console.log("urlObject", pathname);

        if (method === "OPTIONS") {
            return this.options(request, response, pathname);
        }
    
        if (method === "POST") {
            return this.post(request, response, pathname);
        }
        return null;
    }

    options(request:http.IncomingMessage, response: http.ServerResponse<http.IncomingMessage>, pathname: string) {
        response.writeHead(200, {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        });
        response.end("ok");
    }

    post(request:http.IncomingMessage, response: http.ServerResponse<http.IncomingMessage>, pathname: string) {
        let evt;
        let body = "";

        request.on("data", (data) => {
            body += data;
            console.log("post loop");
        });
        request.on("end", () => {
            evt = body;
            response.end("ok");
            this.session.receive(pathname, evt);
        });
    }

    startServer() {
        this.server = http.createServer((req, res) => this.handleRequest(req, res)).listen(port);
    }    
}

class EventEmitter {
    server?: ws.WebSocketServer;
    session: Session;
    interval: ReturnType<typeof setInterval> | undefined;
    connections: Map<ws.WebSocket, {alive: boolean}>;
    connectionsArray: Array<ws.WebSocket>;

    constructor(session:Session) {
        this.session = session;
        this.connections = new Map();
        this.connectionsArray = [];
    }

    startServer() {
        const heartbeat = (ws:ws.WebSocket) => {
            this.connections.set(ws, {alive: true});
            console.log(this.connections);
        }

        const ping = () => {
            console.log("ping", this.connections.size);
            for (const [ws, obj] of this.connections) {
                console.log("ping loop", obj);
                if (obj.alive === false) {
                    this.connections.delete(ws);
                    ws.terminate();
                    continue;
                }
                this.connections.set(ws, {alive: false});
                ws.ping();
            }
        };

        this.interval = setInterval(ping, 30000);

        this.server = new ws.WebSocketServer({port: port + 1});
        this.server.on('connection', (ws:ws.WebSocket, request, client)  => {
            console.log("connection");
            this.connections.set(ws, {alive: true});
            this.connectionsArray.push(ws);
            ws.on('pong', () => heartbeat(ws));
        });
    }

    emit(path:string, data:any) {
        console.log("connections.size", this.connections.size);
        const ary = this.connectionsArray;
        console.log("emit", ary);

        for (let i = 0; i < ary.length; i++) {
            const ws = ary[i];
            console.log("sending", Object.keys(JSON.parse(data)));
            this.send(ws, data);
        }
    }

    send(socket:ws.WebSocket, data:any) {
        socket.send(data);
    }
}

class Session {
    id:SessionID;
    start: Timestamp;
    trackSegments: Map<Path, [TrackSegment]> // (sorted by start time)
    time: Timestamp; // curren wall clock time
    server?: EventServer;
    emitter?: EventEmitter;
    renkon?: any;

    constructor(start:Timestamp) {
        this.id = randomString();
        this.start = start;
        this.time = start;
        this.trackSegments = new Map();
    }

    async loadRenkon() {
        const {renkonify} = renkon;
        const funcs = await this.getFunctions();
        this.renkon = await renkonify(funcs[0], {
            receive: (path:string, evt:any) => this.receive(path, evt),
            emit: (path:string, evt:any) => this.emit(path, evt)
        })        
    }

    createServer() {
        this.server = new EventServer(this);
        this.server.startServer();
        this.emitter = new EventEmitter(this);
        this.emitter.startServer();
    }

    receive(path:string, evt:any) {
        if (typeof evt === "string") {
            evt = JSON.parse(evt);
        }

        console.log("session.receive", Object.keys(evt));

        const track = this.ensureTrackSegment(path);
        track.add(evt);
        this.renkon?.registerEvent(path, evt);
    }

    emit(path:string, evt:any) {
        debugger;
        if (!this.emitter) {return;}
        if (typeof evt !== "string") {
            evt = JSON.stringify(evt);
        }

        this.emitter.emit(path, evt);
    }

    newTrackSegment(path:Path) {
        const segment = new TrackSegment(path, this.time);
        let array = this.trackSegments.get(path);
        if (!array) {
            array = [segment];
            this.trackSegments.set(path, array);
        } else {
            array.push(segment)
        }
        return segment;
    }

    ensureTrackSegment(path:string) {
        const array = this.trackSegments.get(path);
        if (array) {return array[array.length - 1]}
        return this.newTrackSegment(path);
    }

    getFunctions(optFileNames?:Array<string>) {
        let fileNames = optFileNames;
        if (!fileNames) {
            const index = process.argv.lastIndexOf("--");
            if (index >= 0) {
                fileNames = process.argv.slice(index + 1);
            } else {
                fileNames = [];
            }
        }

        return Promise.all(fileNames.map((f) => eval(`import("${f}")`))).then((modules) => {
            const funcs:Array<Function> = [];
 
            modules.forEach((module) => {
                const keys: Array<string> = Object.keys(module);
                for (const key of keys) {
                    if (typeof module[key] === "function") {
                        funcs.push(module[key]);
                    }
                }
            });
            return funcs;
        });
    }
}

class TrackSegment {
    start: Timestamp;
    path: Path; // the semantic of it is to be determined, but it should be stable
    events: Array<any>;
    meta: Array<any>;

    constructor(path:string, start:Timestamp) {
        this.start = start;
        this.path = path;
        this.events = [];
        this.meta = [];
    }

    add(evt:any) {
        this.events.push(evt);
    }
}

const session = new Session(Date.now());
session.createServer();
session.loadRenkon();

dns.lookup(os.hostname(), (err:any, addr:string, _fam:any) => {
    console.log(`Running at http://${addr === undefined ? "localhost" : addr}${((port === 80) ? '' : ':')}${port}/`);
});


/*
  session is a set of track segments.

  A Renkon dependency graph *uses* the segments.
  
  depdendency handling creates events. emits store them.

  There should be a way to get some past events from track segments.

  When an event comes in, it triggers renkon-like dependency propagation.

  If it his Events.emit() like:

  Events.emit("transcription", transcribed)

  the new event in transcribed is stored in transcription.
*/
