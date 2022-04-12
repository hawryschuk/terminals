> 2021-07-12 : Software Development : Terminal Communications : Hawryschuk, Alexander

# Terminal Services
This package provides abstract classes for terminals to be used in a software application for one or more users in one or more places to use the software in tandem.

A terminal is a standad-communication device for input and output, and an application interfaces with one or more users through terminals. Terminals may be interfaced through CLI, through GUI, and remotely through REST-API and WebSockets working with the application and users together.

An example is Bob playing a card game with three other friends. Bob launches bob.com/cardgame, starts a new game with three online-terminals for his freinds. Bobs friends visit the site, join his game, and play the game through. This all happened through the shared-memory of the two-party WebTerminal interface abstraction.

User Stories:
- As a developer, I want to write applications that faciliate remote [user] interaction
  - Terminal-Services server that maintains WebTerminals (RESTAPI)
     - STDOUT : Write to WebTerminal
     - STDIN  : Prompt for input and wait for a response
- As a user, I want to interface with an application through standard-communication protocols (STDIN/STDOUT)
  - Connect to the terminal ( console, gui-widgets, rest-api )
  - Maintain the connection with updates
  - Respond to prompts

```plantuml
@startuml
    actor OnlinePlayer
    actor Bob
    Bob --> UserApp : Start a new 2 vs 2 game
    
    loop 3x - WebTerminals are created
        UserApp -> TerminalServer : WebTerminal.create()
        loop async while !finished
            TerminalServer --> TerminalServer : keepAppAlive()
        end
    end
  
    loop 3x - Online players have joined
        OnlinePlayer -> UserApp : 2vs2 online - join as player2
        UserApp -> TerminalServer : what terminals are free?
        TerminalServer -> UserApp : terminals[a,b,c]
        UserApp -> TerminalServer : claim terminal A/B/C
    end

    
    loop until game-finishes
        WebTerminal <-> UserApp : stdout&prompt
        WebTerminal -> TerminalServer : stdout&prompt

        TerminalServer -> UserApp : stdout&prompt
        UserApp -> TerminalServer : prompt-responses
        TerminalServer -> WebTerminal : prompt-responses
        WebTerminal <-> UserApp : stdout&prompt
    end
@enduml
```

```mermaid
classDiagram

    UserApplication                 o-- Terminal: has/creates
    UserApplication                 .. User:operates/is-operated-by
    User                            o-- Terminal
    ConsoleTerminal                 --|> Terminal
    WebTerminal                     *-- TerminalActivity: has 0+
    WebTerminal                     --|> Terminal
    WebTerminal                     --> TerminalServicesRestApiServer: posts prompt-responses
    WebTerminal                     <.. TerminalServicesWebSocketServer: gets push-notifications
    TerminalServicesWebSocketServer *-- TerminalServicesApplication
    TerminalServicesRestApiServer   *-- TerminalServicesApplication
    TerminalServicesApplication     *-- DDB: persists WebTerminals to AWS-CloudStorage    
    DDB                             --|> DAO: 
    
    TerminalServicesRestApiServer:uri
    TerminalServicesWebSocketServer:uri

    class TerminalActivity {
        type
        message
    }

    TerminalActivity "1" *.. "0..1" Prompt

    class Prompt {
        type
        message
        initial
        min
        max
        choices
    }

    class Terminal {
        id
        stdin
        stdout
        owner
        started
        finished
        - notify()
        + subscribe()
    }
    class WebTerminal {
        ~retreive()
        ~create()
        baseuri
        wsuri
        maintain()
    }    
```
