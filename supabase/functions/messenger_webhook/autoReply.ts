// Rule-based auto-replies for Messenger: a greeting, an away message outside
// opening hours, and a short list of quick questions. Pure functions so every
// rule can be unit tested; the webhook does the sending and saving.

export type AutoReplySettings = {
  auto_replies_enabled: boolean;
  greeting_text: string;
  away_enabled: boolean;
  away_text: string;
  timezone: string;
  open_days: number[]; // ISO weekdays, 1 = Monday
  open_from: string; // "09:00" or "09:00:00"
  open_to: string;
  qualify_enabled: boolean;
  question_1: string | null;
  question_2: string | null;
  question_3: string | null;
  closing_text: string;
};

export type ConversationState = {
  step: number; // questions asked so far
  greeted_at: string | null;
  away_sent_at: string | null;
  done: boolean;
  handoff: boolean;
  answers: Record<string, string>;
};

export const emptyState = (): ConversationState => ({
  step: 0,
  greeted_at: null,
  away_sent_at: null,
  done: false,
  handoff: false,
  answers: {},
});

export type AutoReplyResult = {
  send: string[];
  state: ConversationState;
  /** True when the customer asked for a person: staff should be alerted. */
  handoffRequested: boolean;
  /** Set once all questions are answered. */
  finishedAnswers: { question: string; answer: string }[] | null;
};

const AWAY_REPEAT_MS = 12 * 60 * 60 * 1000;
// Deliberately narrow: "3 person sofa" or "someone told me" must not trigger it.
const HANDOFF =
  /\b(human|real person|speak to|talk to|call me|representative|stop|unsubscribe)\b/i;

const toMinutes = (time: string) => {
  const [h, m] = time.split(":");
  return Number(h) * 60 + Number(m ?? 0);
};

export const isOpenNow = (settings: AutoReplySettings, now: Date) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: settings.timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const isoDay =
    ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday")) +
    1;
  const minutes = Number(get("hour")) * 60 + Number(get("minute"));
  return (
    settings.open_days.includes(isoDay) &&
    minutes >= toMinutes(settings.open_from) &&
    minutes < toMinutes(settings.open_to)
  );
};

const questionsOf = (settings: AutoReplySettings) =>
  [settings.question_1, settings.question_2, settings.question_3]
    .map((q) => q?.trim())
    .filter((q): q is string => !!q);

export const decideAutoReply = (input: {
  settings: AutoReplySettings;
  state: ConversationState;
  text: string;
  now: Date;
  /** A member of staff has replied recently: the automation stays quiet. */
  humanActive: boolean;
}): AutoReplyResult => {
  const { settings, text, now, humanActive } = input;
  const state: ConversationState = {
    ...input.state,
    answers: { ...input.state.answers },
  };
  const quiet: AutoReplyResult = {
    send: [],
    state,
    handoffRequested: false,
    finishedAnswers: null,
  };

  if (!settings.auto_replies_enabled || humanActive || state.handoff)
    return quiet;

  if (HANDOFF.test(text)) {
    state.handoff = true;
    state.done = true;
    return {
      send: [
        "No problem. A member of the team will pick this up and reply to you here.",
      ],
      state,
      handoffRequested: true,
      finishedAnswers: null,
    };
  }

  const send: string[] = [];
  const nowIso = now.toISOString();
  const questions = questionsOf(settings);

  // Record the answer to the question we asked last time.
  if (
    settings.qualify_enabled &&
    !state.done &&
    state.step > 0 &&
    state.step <= questions.length
  ) {
    state.answers[`q${state.step}`] = text.trim().slice(0, 500);
  }

  if (!state.greeted_at) {
    send.push(settings.greeting_text);
    state.greeted_at = nowIso;
  }

  const open = isOpenNow(settings, now);
  if (
    settings.away_enabled &&
    !open &&
    (!state.away_sent_at ||
      now.getTime() - Date.parse(state.away_sent_at) > AWAY_REPEAT_MS)
  ) {
    send.push(settings.away_text);
    state.away_sent_at = nowIso;
  }

  let finishedAnswers: AutoReplyResult["finishedAnswers"] = null;
  if (settings.qualify_enabled && !state.done && questions.length > 0) {
    if (state.step < questions.length) {
      send.push(questions[state.step]);
      state.step += 1;
    } else {
      send.push(settings.closing_text);
      state.done = true;
      finishedAnswers = questions.map((question, index) => ({
        question,
        answer: state.answers[`q${index + 1}`] ?? "",
      }));
    }
  }

  return { send, state, handoffRequested: false, finishedAnswers };
};
