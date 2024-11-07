A session is a collection of `track segments`.

A track segments

Session {
  id:string,
  start: timestamp,
  trackSegments; Array<TrackSegment> // (sorted by start time)
}

TrackSegment {
 start: timestamp
 type: string
 events: Array<Event>
}

type SessionSnapshot struct {
    ID     ID
    Start  time.Time
    Tracks []*trackSnapshot
}

type trackSnapshot struct {
    ID     ID
    Events []Event
    Start  Timestamp
    Format beep.Format
}

type EventMeta struct {
    Start, End Timestamp
    ID         ID
}

type Event struct {
    EventMeta
    Data  any
}

type AudioEvent {
    AudioData: buffer
}



   
type Span interface {
    Track() *Track
    Span(from, to Timestamp) Span
    Start() Timestamp
    End() Timestamp
    Length() time.Duration
    Audio() beep.Streamer
    EventTypes() []string
    Events(typ string) []Event
}

type Track struct {
	ID      ID
	Session *Session
	start   Timestamp
	audio   *continuousBuffer
	events  sync.Map
}

