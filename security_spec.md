# SonoShield Security Specification

## Data Invariants
1. **Ownership**: A track record cannot exist without a `userId`.
2. **Identity**: The `userId` field must exactly match the authenticated `request.auth.uid`.
3. **Immutability**: Fingerprints and spectral metadata are immutable once recorded to prevent record tampering.
4. **Verification**: Only users with verified emails can write to the registry.

## The "Dirty Dozen" (Attack Payloads)
The following payloads will be blocked by the `firestore.rules`:
1. **Identity Spoofing**: Attempting to create a track with a different user's `uid`.
2. **Shadow Field Injection**: Adding an `isVerified: true` field to the document that isn't in the schema.
3. **ID Poisoning**: Using a 2KB string as a document or user ID to stress system resources.
4. **Metadata Tampering**: Attempting to update a fingerprint after the track is registered.
5. **PII Leakage**: Attempting to list tracks belonging to another user.
6. **Unverified Bypass**: Attempting to write while `email_verified` is false.
7. **Type Mismatch**: Sending a string for the `timestamp` field instead of a Firestore Timestamp.
8. **Size Overload**: Sending a 1MB string for the `title`.
9. **Zero-Width Character Injection**: Using invisible characters in IDs to bypass string matching.
10. **Resource Exhaustion**: Querying all users' tracks without a user-scoped filter.
11. **Timestamp Forgery**: Providing a client-side timestamp instead of `request.time`.
12. **Collection Crawling**: Attempting to 'list' the root level of the `users` collection.
