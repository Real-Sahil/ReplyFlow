import { EditBase, Form, required } from "ra-core";
import { AutocompleteArrayInput } from "@/components/admin/autocomplete-array-input";
import { BooleanInput } from "@/components/admin/boolean-input";
import { TextInput } from "@/components/admin/text-input";
import { Card, CardContent } from "@/components/ui/card";

import { FormToolbar } from "../layout/FormToolbar";

const weekdays = [
  { id: 1, name: "Monday" },
  { id: 2, name: "Tuesday" },
  { id: 3, name: "Wednesday" },
  { id: 4, name: "Thursday" },
  { id: 5, name: "Friday" },
  { id: 6, name: "Saturday" },
  { id: 7, name: "Sunday" },
];

const Section = ({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) => (
  <div className="flex flex-col gap-3">
    <div>
      <h6 className="text-lg font-semibold">{title}</h6>
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
    </div>
    {children}
  </div>
);

export const MessengerSettingsEdit = () => (
  <EditBase
    actions={false}
    resource="messenger_settings"
    id={1}
    redirect={false}
  >
    <div className="mt-2 flex">
      <Form className="flex flex-1 flex-col gap-4 pb-2">
        <Card>
          <CardContent className="flex flex-col gap-8">
            <Section
              title="Automatic replies"
              hint="Off by default. Messages are sent exactly as written below. Nothing is sent once a member of staff has replied to that customer in ReplyFlow, or when the customer asks for a person."
            >
              <BooleanInput
                source="auto_replies_enabled"
                label="Reply automatically on Messenger"
              />
              <TextInput
                source="greeting_text"
                label="Greeting (first message from a new customer)"
                multiline
                rows={3}
                validate={required()}
                helperText={false}
              />
            </Section>

            <Section
              title="Opening hours and away message"
              hint="These start as placeholders. Set your real opening hours before turning the away message on."
            >
              <BooleanInput
                source="away_enabled"
                label="Send an away message outside opening hours"
              />
              <AutocompleteArrayInput
                source="open_days"
                label="Open on"
                choices={weekdays}
                helperText={false}
              />
              <div className="grid grid-cols-2 gap-4">
                <TextInput
                  source="open_from"
                  label="Opens"
                  type="time"
                  helperText={false}
                />
                <TextInput
                  source="open_to"
                  label="Closes"
                  type="time"
                  helperText={false}
                />
              </div>
              <TextInput
                source="away_text"
                label="Away message"
                multiline
                rows={3}
                validate={required()}
                helperText="Sent at most once every 12 hours per customer. Times use the UK time zone."
              />
            </Section>

            <Section
              title="Quick questions"
              hint="After the greeting, ask up to three questions one at a time. Answers are saved as a note on the enquiry. Leave a question empty to skip it."
            >
              <BooleanInput
                source="qualify_enabled"
                label="Ask the quick questions"
              />
              <TextInput
                source="question_1"
                label="Question 1"
                helperText={false}
              />
              <TextInput
                source="question_2"
                label="Question 2"
                helperText={false}
              />
              <TextInput
                source="question_3"
                label="Question 3"
                helperText={false}
              />
              <TextInput
                source="closing_text"
                label="Message after the last answer"
                multiline
                rows={3}
                validate={required()}
                helperText={false}
              />
            </Section>
            <FormToolbar />
          </CardContent>
        </Card>
      </Form>
    </div>
  </EditBase>
);
