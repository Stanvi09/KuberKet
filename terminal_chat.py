"""Run the tractor-loan conversation using typed text only."""

from conversation_agent import ConversationAgent


def main() -> None:
    language = input("Language (hi or en, default hi): ").strip().lower() or "hi"
    try:
        agent = ConversationAgent(language=language)
        print(agent.start())
        while agent.state != "complete":
            answer = input("> ")
            previous_spoken = agent.spoken_explanation
            print(agent.respond(answer))
            if previous_spoken is None and agent.spoken_explanation is not None:
                print("बोला जाएगा:")
                print(agent.spoken_explanation)
    except ValueError as exc:
        print(f"Could not start chat: {exc}")


if __name__ == "__main__":
    main()
