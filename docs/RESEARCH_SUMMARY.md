# Research Summary

## What you wanted

You wanted the assistant to:

1. **Summarize the content of the page** you had open (the page content sent as browser/tab context).
2. **Create a new Google Doc** with a title like “Research Summary” and put that summary inside it.

So: *summarize this page → put that summary into a new Google Doc*.

---

## What happened before (and why)

The assistant **did not** have a “create Google Doc” tool. It only had **Calendar** tools (`create_calendar_event`, `list_calendar_events`). So when you said “summarize this page and put it in a new doc called research summary,” it:

- Could not create an actual Google Doc.
- Created **calendar events** instead (e.g. “Research Summary Documentation”, “Create Research Summary Document in Google Docs”), which was not what you meant.

So the confusion was: **no Google Docs tool existed**; the model fell back to the only Google action it had (calendar events).

---

## What’s implemented now

The backend now has a **create_google_doc** tool so the intended flow works:

1. **Google Docs scope** is requested when you connect Google (alongside Calendar). If you connected Google before, **reconnect once** in Connectors so the new Docs permission is granted.
2. **Tool: `create_google_doc`**  
   - Parameters: `title` (e.g. “Research Summary”), `content` (the full body text, e.g. the summary).  
   - It creates a new Google Doc with that title and body and returns the link.
3. **Instructions for the assistant**  
   - When you say things like “summarize this page and put it in a new Google Doc” or “make a doc called Research Summary with a summary of this page,” the assistant is instructed to:
     - Use the **browser context** (open tabs / page content) to write the summary.
     - Call **create_google_doc** with that summary as the content (and a clear title).
     - **Not** create calendar events for document requests.

So the flow you wanted is now supported: **summarize the page (from context) → create a new Google Doc with that summary.**

---

## How to use it

1. Reconnect **Google** in the extension (Connectors → Google → Connect) so the Docs scope is granted.
2. Open the **page you want summarized** and keep it in your tabs (or at least have “Include tab context” checked when you send the message).
3. Say something like:  
   *“Summarize the content on this page and create a new Google Doc called Research Summary with that summary.”*  
   The assistant will use the page content from context, write the summary, and create the Doc with the summary inside.
