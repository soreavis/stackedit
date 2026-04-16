# Mermaid smoke test (v11.4.1)

Paste into StackEdit. Every fenced `mermaid` block should render as an SVG in the preview (right pane). Each diagram type below exercises a different lazy-loaded Mermaid chunk.

## Flowchart

```mermaid
flowchart TD
  A[Start] --> B{Is it valid?}
  B -- yes --> C[Process]
  B -- no --> D[Reject]
  C --> E[End]
  D --> E
```

## Sequence

```mermaid
sequenceDiagram
  participant U as User
  participant A as App
  participant S as Server
  U->>A: Click login
  A->>S: POST /auth
  S-->>A: 200 OK + token
  A-->>U: Redirect to dashboard
```

## Class

```mermaid
classDiagram
  class Animal {
    +String name
    +int age
    +move()
  }
  class Dog {
    +String breed
    +bark()
  }
  Animal <|-- Dog
```

## State

```mermaid
stateDiagram-v2
  [*] --> Idle
  Idle --> Loading : fetch()
  Loading --> Success : 200
  Loading --> Error : >=400
  Success --> [*]
  Error --> Idle : retry
```

## Gantt

```mermaid
gantt
  title Release plan
  dateFormat  YYYY-MM-DD
  section Security
  Audit            :done,    a1, 2026-04-16, 1d
  Harden           :active,  a2, after a1, 2d
  Dep upgrades     :         a3, after a2, 1d
  section Ship
  Deploy           :         b1, after a3, 1d
```

## Pie

```mermaid
pie title Package origins after cleanup
  "vite + plugins" : 40
  "vue + vuex" : 25
  "mermaid chunks" : 20
  "everything else" : 15
```

## Journey

```mermaid
journey
  title User sign-in
  section Discover
    Landing page: 5: User
    Click sign in: 4: User
  section Auth
    OAuth redirect: 3: User, App
    Token exchange: 4: App, Server
  section Use
    Open editor: 5: User
```

## Git graph

```mermaid
gitGraph
  commit id: "init"
  branch feature/vercel-migration
  checkout feature/vercel-migration
  commit id: "vite"
  commit id: "headers"
  commit id: "dompurify"
  checkout main
  merge feature/vercel-migration
```

## Intentional parse error — should log to console, preview should still render the rest

```mermaid
flowchart TD
  A --> B -- syntax error here ?
```
