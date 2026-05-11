import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ContactSearch } from "./contact-search";
import { Timeline } from "./timeline";
import {
  getAccount,
  getAccountContacts,
  getCommonJourneys,
  getContact,
  getContactTimeline,
  searchContacts,
  type ContactSearchRow,
  type ContactSummary,
} from "./query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export const metadata = { title: "Contact Journey · Marketing BI" };

export default async function JourneyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const contactId = first(raw.contactId);
  const accountId = first(raw.accountId);
  const q = first(raw.q) ?? "";

  // Three modes:
  //  1. ?contactId=X → full timeline view for one contact
  //  2. ?accountId=X → list of contacts in that account, click to drill in
  //  3. else        → search box (filtered list when ?q=…) + common journeys
  if (contactId) {
    return <ContactJourneyView contactId={contactId} />;
  }
  if (accountId) {
    return <AccountContactsView accountId={accountId} />;
  }
  return <SearchAndDiscoveryView query={q} />;
}

// ===========================================================================
// View 1: per-contact journey
// ===========================================================================

async function ContactJourneyView({ contactId }: { contactId: string }) {
  const [contact, events] = await Promise.all([
    getContact(contactId),
    getContactTimeline(contactId),
  ]);

  if (!contact) {
    return (
      <div className="mx-auto max-w-3xl">
        <Card>
          <CardHeader>
            <CardTitle>Contact not found</CardTitle>
            <CardDescription>
              No Contact with id <code>{contactId}</code> exists, or it's been soft-deleted.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link className="text-sm underline" href="/dashboard/journey">
              ← Back to contact search
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const milestones: { stage: "MQL" | "SQL" | "Opp" | "Customer"; date: string }[] = [];
  if (contact.mqlDate)      milestones.push({ stage: "MQL",      date: contact.mqlDate });
  if (contact.sqlDate)      milestones.push({ stage: "SQL",      date: contact.sqlDate });
  if (contact.oppDate)      milestones.push({ stage: "Opp",      date: contact.oppDate });
  if (contact.customerDate) milestones.push({ stage: "Customer", date: contact.customerDate });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <header>
        <Link className="text-xs text-(--color-text-muted) hover:underline" href="/dashboard/journey">
          ← Contact search
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">{contact.name}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-(--color-text-muted)">
          {contact.email ? <span>{contact.email}</span> : null}
          {contact.accountId ? (
            <Link href={`/dashboard/journey?accountId=${contact.accountId}`} className="hover:underline">
              Account: {contact.accountName ?? contact.accountId}
            </Link>
          ) : null}
          {contact.lifecycleStage ? <span>Stage: {contact.lifecycleStage}</span> : null}
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Lifecycle milestones</CardTitle>
        </CardHeader>
        <CardContent>
          {milestones.length === 0 ? (
            <p className="text-sm text-(--color-text-muted)">No lifecycle transitions recorded.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(["MQL", "SQL", "Opp", "Customer"] as const).map((stage) => {
                const m = milestones.find((m) => m.stage === stage);
                return (
                  <div key={stage} className="rounded-md border bg-(--color-surface) px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wide text-(--color-text-muted)">
                      {stage}
                    </div>
                    <div className="mt-0.5 text-sm font-medium tabular-nums">
                      {m ? m.date : "—"}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Campaign touchpoints · {events.length}</CardTitle>
          <CardDescription>
            Every CampaignMember row for this contact, in chronological order. Milestone pills mark
            where each lifecycle transition fell within the timeline.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Timeline events={events} milestones={milestones} />
        </CardContent>
      </Card>
    </div>
  );
}

// ===========================================================================
// View 2: account contacts list (drill-down from G3 Accounts)
// ===========================================================================

async function AccountContactsView({ accountId }: { accountId: string }) {
  const [account, contacts] = await Promise.all([
    getAccount(accountId),
    getAccountContacts(accountId, 100),
  ]);

  if (!account) {
    return (
      <div className="mx-auto max-w-3xl">
        <Card>
          <CardHeader>
            <CardTitle>Account not found</CardTitle>
            <CardDescription>
              No Account with id <code>{accountId}</code> exists.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link className="text-sm underline" href="/dashboard/accounts">
              ← Back to accounts
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <header>
        <Link className="text-xs text-(--color-text-muted) hover:underline" href="/dashboard/accounts">
          ← Accounts
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">{account.name ?? account.id}</h1>
        <p className="mt-1 text-sm text-(--color-text-muted)">
          {contacts.length} {contacts.length === 1 ? "contact" : "contacts"} in this account. Click
          one to open their full campaign journey.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Contacts</CardTitle>
          <CardDescription>SQL contacts listed first.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <ContactList contacts={contacts} />
        </CardContent>
      </Card>
    </div>
  );
}

// ===========================================================================
// View 3: search + common journeys (default landing)
// ===========================================================================

async function SearchAndDiscoveryView({ query }: { query: string }) {
  const [results, journeys] = await Promise.all([
    query.trim() ? searchContacts(query, 25) : Promise.resolve([] as ContactSearchRow[]),
    getCommonJourneys(15),
  ]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Contact Journey</h1>
        <p className="mt-1 text-sm text-(--color-text-muted)">
          Search a Contact to see their full timeline of campaign touchpoints with lifecycle
          milestones overlaid. You can also drill in from the Accounts dashboard.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Find a contact</CardTitle>
        </CardHeader>
        <CardContent>
          <ContactSearch initialQuery={query} />
          {query.trim() ? (
            <div className="mt-4">
              {results.length === 0 ? (
                <p className="text-sm text-(--color-text-muted)">
                  No contacts match <strong>"{query}"</strong>.
                </p>
              ) : (
                <ContactList contacts={results} />
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Common journeys to SQL</CardTitle>
          <CardDescription>
            For every Contact that reached SQL, the campaign type of their first touchpoint and
            the campaign type of their last touchpoint in the 90-day pre-SQL window. Grouped by
            (first, last) pair, ordered by frequency.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {journeys.length === 0 ? (
            <p className="px-4 py-6 text-sm text-(--color-text-muted)">
              No SQL transitions with in-window touchpoints yet.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b bg-(--color-surface-2) text-xs uppercase tracking-wide text-(--color-text-muted)">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">First campaign type</th>
                  <th className="px-3 py-2 text-left font-medium">Last campaign type</th>
                  <th className="px-3 py-2 text-right font-medium">Contacts</th>
                </tr>
              </thead>
              <tbody>
                {journeys.map((j, i) => (
                  <tr
                    key={`${j.firstType}|${j.lastType}`}
                    className={
                      i % 2 === 1
                        ? "border-b bg-(--color-surface-2)/30 last:border-b-0"
                        : "border-b last:border-b-0"
                    }
                  >
                    <td className="px-3 py-2">{j.firstType}</td>
                    <td className="px-3 py-2">{j.lastType}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{j.contacts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ===========================================================================
// Helpers
// ===========================================================================

function ContactList({ contacts }: { contacts: ContactSearchRow[] }) {
  return (
    <ul className="divide-y">
      {contacts.map((c) => (
        <li key={c.id}>
          <Link
            href={`/dashboard/journey?contactId=${c.id}`}
            className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-(--color-surface-2)"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{c.name}</div>
              <div className="truncate text-xs text-(--color-text-muted)">
                {c.email ?? "—"}
                {c.accountName ? <> · {c.accountName}</> : null}
              </div>
            </div>
            <div className="text-right text-xs text-(--color-text-muted)">
              {c.sqlDate ? <span className="text-(--color-accent)">SQL {c.sqlDate}</span> : c.lifecycleStage ?? "—"}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function first(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}
