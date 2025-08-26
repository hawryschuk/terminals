> 2021-07-12 : Software Development : Terminal Communications : Hawryschuk, Alexander
> 2025-08-25 : Refactoring of Terminal[Console|Web] and Rewrite of Terminal Server and Service Center

# Terminal Services
This package provides abstract classes for terminals to be used in a software application as a communication layer between the producer and consumer of services.

* Terminals provide a means of sending/receiving messages and sending/responding-to queries.

An example is as follows: A Service called "Guessing Game" generates a random number between 1 and 10. It then prompts the players to guess a number between 1 and 10. It determines which player is closest, and announces the winner.


```plantuml
@startuml
title Terminal Services : Business Model / Class Diagrams

class Terminal {
    prompts <<get>>
    inputs <<get>>
    input <<get>>

    prompt(options)
    send(message)
    respond(answer,question?)
    answer(Record<question,answer[]>)
}

class Activity {
    message
}

class Prompt {
    type
    name
    resolved?
    min?
    max?
    initial?
    choices?
    clobber?
    timeout?
}

class Choice {
    title
    value
    disabled?
    description?
}

class TerminalServer {}
class Message {}
class ConsoleTerminal {}
class WebTerminal {
    __+ connect(id, baseurl) : WebTerminal__
}

Terminal o-- Activity
Prompt --|> Activity
Message --|> Activity
Prompt o-- Choice
ConsoleTerminal --|> Terminal
WebTerminal --|> Terminal
TerminalServer o-- WebTerminal

@enduml
```

```plantuml
@startuml
    title Service Center : Where Service Producers and Consumers Meet : Business Model
    class User {
        id
        publicKey
        privateKey
        verify()
        sign()
    }

    class ServiceCenter {
        terminals
        services
        tables
        join() Terminal
    }

    class Service {
        USERS : number[] | number | *
        NAME : string
        seats:Seat[]

        operate(once?)
        broadcast(message)
        message(seat,message)
        prompt(seat,prompt)
    }

    class Table {
        terminals
        seats
        service
    }

    class Seat {
        terminal        
    }

    class Terminal {
        owner
        service
        lounge
        table
        seat
        prompt(question)
        respond(answer,question)
    }

    class ServiceRegistration {
        class:Service
    }
    
    GuessingGame --|> Service

    ServiceCenter o-- Terminal
    ServiceCenter o-- Table
    ServiceCenter o-- ServiceRegistration

    Table *-- Terminal
    Table o-- Seat
    Table o-- Service

    Seat -.- Terminal
@enduml

```

```plantuml
@startuml
title Service Center : User Flow Sequence Diagram

actor User
participant Server
participant Terminal
participant Service

== Acquire Terminal ==
User -> Server: Request Terminal
Server -> Terminal: Create terminal session
Server -> User: Provide Terminal

== Communication via Terminal ==
note over User,Server
  All further communication occurs
  via the Terminal:
  - User: Respond to Prompts
  - Server: Write Messages & Prompts
  - Service: Write Messages & Prompts & Notifies Termination
end note

== Entry Stage ==
    loop Prompt For Username
        Server -> Terminal: Prompt [Name]
        note right of Server
            Check name is used
        end note
        alt Name exists
            note right of Server
                Continue Loop
            end note
        else Name available
            note right of Server
                Accept & Exit Loop
            end note
        end
    end

== Lobby Stage ==
Server -> Terminal: Message [Service List]

loop Chat Lounge
    Server -> Terminal: Prompt [Lounge Message]
end

loop Menu
    Server -> Terminal: Select Service
    Server -> Terminal: Show Tables
    Server -> Terminal: Join Table
    Server -> Terminal: Create Table
    Server -> Terminal: Send Table Chat
    Server -> Terminal: Leave Table
    Server -> Terminal: Show Seats
    Server -> Terminal: Sit
    Server -> Terminal: Stand
    Server -> Terminal: Ready
end

alt All seats occupied & ready
  Server -> Service : Start Service
else Not all seats ready
    note right of Server
        Wait for more users
    end note
end

== Service Stage ==
  loop Until Service ends
    Service -> Terminal: Message User(s)
    Service -> Terminal: Prompt User(s)
    User -> Terminal: Respond to Prompts
    ... Serviceplay continues ...
  end

  Service -> Terminal : Announce Winners and Losers

== Apply Results ==
    Server -> Terminal: Announce effects ( rating , credits , stats , etc )
    Server -> Terminal: Return to Lobby Stage : Wait for User to be Ready to start again

@enduml

```

```plantuml
@startuml
title Example Service: Guessing Game

actor Player1
actor Player2
participant Game

== Initialize ==
loop For each player
    Player1 -> Game: Join game
    Player1 -> Game: Take seat
    Player1 -> Game: Indicate Ready
end

== Run ==
note over Game
  Generate random number N in [1..10]
end note

loop For each player
  Game -> Player1: "Guess a number (1..10)"
  Player1 --> Game: guess g1
end

note over Game
  Determine winners: players where guess == N
end note

== Results ==
loop For each player
  alt Player guessed correctly (g == N)
    Game -> Player1: You WON!
  else
    Game -> Player1: You LOST.
  end
end

@enduml

```

### TODO : 
- Restore functionality :
    - Table Chat
    - Invite Robot
    - Boot Robot
    - Stand
    - Switch Service
    - Exit
    - Error handling
        - user goes offline
        - error in service
    - Remote Service Center
    - CLI
- User from @hawryschuk-crypto
    - sign activity
- Migrate to @hawryschuk-crypto/Server
