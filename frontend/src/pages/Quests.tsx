import QuestList from "../components/QuestList";

export default function Quests() {
  return (
    <div className="quests-page">
      <h1 className="section-title">📜 Daily quests</h1>
      <p className="muted">
        3 new quests every day at 00:00 WIB. Only games against the AI (and Angry Bird rounds) count, checked by
        the server. You get one free reroll per day.
      </p>
      <QuestList />
    </div>
  );
}
