# Doculord

Doculord is a generalized, framework agnostic, library of tools that help to create efficient local-first collaborative web applications.

This is done through the concept of a document-based state management.

One of the hardest things about local-first apps is that they are technically a distributed system and require data syncing, which in of itself
can result in a lot of hard to reason about conflict resolution strategies.

Doculord borrows ideas from great works such as apollo/client, pouchdb, trpc, graphql etc., but tries hard not to enforce a specific framework or technology in particular. Instad Doculord seeks to provide drop-in enhancements to your existing stack.

## Tools


- Docucache - Cache and modify documents from any source

- Documerge (Docucache + Automerge 2) - Useful for creating realtime collaboration in a peer-to-peer fashion as opposed to centralized, allowing for offline collaboration between multiple devices. Uses Conflict-Free Replicated Data Types (CRDT) to ensure that the state of two caches are _eventually_ synchronized.

- Doculord - Uses the above technologies to create atomic actions that can be used to build a reactive local-first collaborative web app.

- Offline-mode - Detect (or manually set) when network connection is offline and handle offline requests.

