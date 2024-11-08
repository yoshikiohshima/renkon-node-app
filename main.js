export function main() {
    const foo = Events.receiver();
    Renkon.app.emit("bar", {"len": foo.input.length})
    return [];
}

/* globals Renkon, Events */
