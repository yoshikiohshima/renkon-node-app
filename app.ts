import * as http from "node:http";
import * as urlParser from "node:url";

type Timestamp = number // js epoch

type TrackID = string;
type SessionID = string;
type Path = string;
type Url = string;

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
        let method = request.method;

        let urlObject = urlParser.parse(request.url!, true);
        if (!urlObject.pathname) {
            response.end("not ok");
            return;
        }
        let pathname = decodeURIComponent(urlObject.pathname);
        if (pathname.startsWith("/")) {
            pathname = pathname.slice(1);
        }
        console.log("urlObject", pathname);
    
        if (method === 'POST') {
            return this.post(request, response, pathname);
        }
        return null;
    }

    post(request:http.IncomingMessage, response: http.ServerResponse<http.IncomingMessage>, pathname: string) {
        let evt;
        let body = "";
        request.on("data", (data) => {
            body += data;
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

class Session {
    id:string;
    start: Timestamp;
    trackSegments: Map<Path, [TrackSegment]> // (sorted by start time)
    time: Timestamp; // curren wall clock time
    server?: EventServer;
    renkon: any;

    async loadRenkon() {
        const mod = await import("renkon-node");
        const {renkonify, getFunctions} = mod;
        const funcs = getFunctions();
        this.renkon = renkonify(funcs[0], {emit: (path:string, evt:any) => this.receive(path, evt)});
    }

    constructor(start:Timestamp) {
        this.id = randomString();
        this.start = start;
        this.time = start;
        this.trackSegments = new Map();
    }

    createServer() {
        this.server = new EventServer(this);
        this.server.startServer();
    }

    receive(path:string, evt:any) {
        if (typeof evt === "string") {
            evt = JSON.parse(evt);
        }

        const track = this.ensureTrackSegment(path);
        track.add(evt);
        this.renkon.registerEvent(path, evt);
        console.log(path, evt);
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
        let array = this.trackSegments.get(path);
        if (array) {return array[array.length - 1]}
        return this.newTrackSegment(path);
    }
}

class TrackSegment {
    start: Timestamp;
    path: string; // the semantic of it is to be determined, but it should be stable
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

require('dns').lookup(require('os').hostname(), (err:any, addr:string, _fam:any) => {
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
