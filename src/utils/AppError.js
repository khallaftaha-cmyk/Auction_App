// An error whose message is safe to show to the user.
// Anything that is NOT an AppError is treated as a bug and hidden behind a generic message.
class AppError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AppError';
    this.code = code;
  }
}

module.exports = AppError;
