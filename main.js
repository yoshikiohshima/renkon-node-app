export function main() {
    const foo = Events.receiver();
    Renkon.app.emit("bar", `bar: ${foo}`)
}

/* globals Renkon, Events */