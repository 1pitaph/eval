export class SecretStorageUnavailableError extends Error {
  constructor(message = "Secure credential storage is unavailable.") {
    super(message);
    this.name = "SecretStorageUnavailableError";
  }
}
