// OBSERVER pattern: the interface every observer implements.
// events: 'AUCTION_CREATED' | 'BID_PLACED' | 'AUCTION_ENDED'
class Observer {
  update(event, data) {
    throw new Error('update(event, data) must be implemented by the observer');
  }
}

module.exports = Observer;
