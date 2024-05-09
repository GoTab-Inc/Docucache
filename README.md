# Docusystem

Docusystem is a framework agnostic js/ts library of tools that help to create efficient, [local-first](https://www.inkandswitch.com/local-first/), collaborative web applications or to enhance an existing web application with optimistic updating and caching.

## Motivation

Web applications often need to communicate with a backend, but latency between network requests can have a noticeable impact on the user's experience.

Docusystem was created to make enhancing front-end UX easier in a few key ways:

1. Docusystem handles caching and management of documents from a central source in your application.
2. Docusystem handles eventual syncing of resources. Docusystem can keep track of changes to documents locally and trigger actions that you've pre-defined as well as receive updates from external sources (server or peers) and update the local state to match.

Docusystem borrows ideas from great works such as apollo/client, pouchdb, trpc, graphql etc., but tries hard not to enforce a specific framework or technology in particular. Instad Docusystem seeks to provide more-or-less drop-in enhancements to an existing stack.

## Tools

- Doculord - Create atomic re-actions to document changes, efficiently handling optimistic updates, retries, and rollbacks.

- Docucache - Cache and modify documents that come back from any source. This can be configured to serve as a source of truth and mutations for Doculord, automatically updating your documents when values in the cache are changed, or it can be used standalone in projects as a store.

- Documerge (WIP) - This is Docucache combined with Automerge 2. A powerful combination useful for creating realtime collaboration in a peer-to-peer fashion as opposed to centralized, allowing for offline collaboration between multiple devices. Uses Conflict-Free Replicated Data Types (CRDT) to ensure that the state of two caches are _eventually_ synchronized.

- Doculine (WIP) - Detect (or manually set) when network connection is offline and create handlers for offline requests.

- Docuworker (planned) - Perform network requests in a service worker so that they don't get cancelled by a user switching between pages 

## Development

Doculord is developed as a typescript library using Bun for workspace package management and 

First [install bun](https://bun.sh/docs/installation).

Then in the root of the project, run

```sh
bun install
```

Most development is test-driven.

## Resources

https://www.inkandswitch.com/local-first/