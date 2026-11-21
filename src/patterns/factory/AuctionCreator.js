// FACTORY METHOD pattern.
//
// AuctionCreator is the "creator". It owns the steps for creating a new auction
// (build() below: the same steps for every type), but it leaves ONE step to its subclasses:
// createStrategy(), the "factory method". Each subclass decides which strategy object is made
// and what is special about the auctions of its type.
//
//   AuctionCreator            build()            <- the shared steps
//     |-- EnglishAuctionCreator  createStrategy() -> new EnglishAuctionStrategy()
//     |-- SealedAuctionCreator   createStrategy() -> new SealedBidStrategy()
//     `-- DutchAuctionCreator    createStrategy() -> new DutchAuctionStrategy()
//
// The controller only says "create an auction of this type"; it never writes `new XStrategy()`
// or decides which database fields a type needs.
class AuctionCreator {
  // The template: validate, ask the factory method for a strategy, assemble the database record.
  build(input, userId, now = Date.now()) {
    this.validate(input);
    const strategy = this.createStrategy(); // <-- the factory method

    const record = {
      title: input.title,
      description: input.description,
      strategy: strategy.name,
      startPrice: input.startPrice,
      startsAt: now,
      endsAt: now + input.durationSeconds * 1000,
      createdBy: userId,
      ...this.extraFields(input), // the fields that differ from one type to another
    };
    return { record, strategy };
  }

  // THE FACTORY METHOD: every concrete creator must override it.
  createStrategy() {
    throw new Error('createStrategy() must be implemented by the creator');
  }

  // Hook: type-specific rules. Throws an AppError when the input does not fit this type.
  validate(input) {}

  // Hook: type-specific database fields (defaults suit the sealed-bid auction).
  extraFields(input) {
    return { minIncrement: 1, floorPrice: null };
  }
}

module.exports = AuctionCreator;
