// OBSERVER pattern: the Subject (also called "publisher").
// The controller says "a bid was placed" and does not care WHO reacts to it.
// Observers register themselves; adding a new reaction (email, stats, ...)
// means writing a new observer, not editing the controller.
class Subject {
  #observers = new Set();

  subscribe(observer) {
    this.#observers.add(observer);
    return () => this.unsubscribe(observer);
  }

  unsubscribe(observer) {
    this.#observers.delete(observer);
  }

  notify(event, data) {
    for (const observer of this.#observers) {
      try {
        observer.update(event, data);
      } catch (err) {
        // One broken observer must never stop the others (or the bid itself).
        console.error(`[observer] ${observer.constructor.name} failed on ${event}:`, err);
      }
    }
  }
}

module.exports = Subject;
