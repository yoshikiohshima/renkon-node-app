import * as http from "node:http";
import * as urlParser from "node:url";

type Timestamp = number // js epoch

type TrackID = string;
type SessionID = string;
type Path = string;
type Url = string;

function randomString() {
    return Math.floor(Math.random() * 36 ** 10).toString(36);
}

class EventServer {
    server: http.Server;
    session: Session;

    constructor(session:Session) {
        this.session = session;
    }
    handleRequest(request, response) {
        let method = request.method;
    
        if (method === 'POST') {
            return this.post(request, response);
        }
        return null;
    }

    post(request:http.IncomingMessage, response: http.ServerResponse<http.IncomingMessage>) {
        let evt;
        let body = "";
        request.on("data", (data) => {
            body += data;
        });
        request.on("end", () => {
            evt = body;
            response.end("ok");
            this.session.receive(evt);
        });
    }

    startServer() {
        this.server = http.createServer((req, res) => this.handleRequest(req, res)).listen(8888);
    }    
}

class Session {
    id:string;
    start: Timestamp;
    trackSegments: Map<Path, [TrackSegment]> // (sorted by start time)
    time: Timestamp; // curren wall clock time
    endPoints: Map<Path, Url>;
    activeEndPoints: Map<Url, http.Agent>;
    server: http.Server;

    constructor(start:Timestamp) {
        this.id = randomString();
        this.start = start;
        this.time = start;
        this.trackSegments = new Map();
        this.endPoints = new Map();
    }

    receive(res) {
        console.log(res);
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
        this.endPoints.set(path, this.newTrackEndPoint(path));
    }

    newTrackEndPoint(path) {
        const base = "localhost:8888/"
        // const key = randomString();
        return base + path;
    }

    receiveEvent(evt) {
        console.log(evt);
    }
}

class TrackSegment {
    start: Timestamp;
    path: string; // the semantic of it is to be determined, but it should be stable
    events: [];
    meta: [];

    constructor(path, start) {
        this.start = start;
        this.path = path;
        this.events = [];
        this.meta = [];
    }
}


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
