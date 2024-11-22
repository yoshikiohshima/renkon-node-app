export function main() {
    const audio = Events.receiver();
    Renkon.app.receive("audio", audio);

    console.log("audio event", typeof audio.audio_data);

    const response = (async (audio) => {
        console.log("response", Object.keys(audio));
        const requestTime = Date.now();
        const response = await fetch("https://substrate.home.arpa/faster-whisper/v1/transcribe", {
            method: "POST",
            mode: "cors",
            headers: {
                "Content-Type": "application/json",                      
            },
            body: JSON.stringify(audio)
        }).catch((e) => {
            console.log(e);
            return;
        });

        const json = await response.json();
        const value = {
            label: audio.label,
            json,
            requestTime,
        };
        console.log("returning response", requestTime);
        return value;
    })(audio);

    // Renkon.app.receive("transcript", response);
    Renkon.app.emit("transcript", response.json);
    return [response];
}
