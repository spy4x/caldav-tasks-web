// Tests for CalDAV XML parsing — covers Radicale (default namespace) and
// Stalwart (uppercase D:/A: prefixes), plus the user-principal-home filter
// that prevents Stalwart's principal collection from being misclassified
// as a calendar.

import { assertEquals } from "jsr:@std/assert@^1"
import { parseCalendars, parseMultistatus } from "./parse.ts"

// ── parseMultistatus ────────────────────────────────────────────────────────

Deno.test("parseMultistatus: Radicale (no prefix)", () => {
  const xml = `<?xml version="1.0"?><multistatus xmlns="DAV:">
    <response>
      <href>/user/cal/A.ics</href>
      <propstat>
        <prop><getetag>"abc123"</getetag></prop>
        <status>HTTP/1.1 200 OK</status>
      </propstat>
    </response>
    <response>
      <href>/user/cal/B.ics</href>
      <propstat>
        <prop><getetag>"def456"</getetag></prop>
        <status>HTTP/1.1 200 OK</status>
      </propstat>
    </response>
  </multistatus>`
  const { hrefs, etagMap } = parseMultistatus(xml)
  assertEquals(hrefs, ["/user/cal/A.ics", "/user/cal/B.ics"])
  assertEquals(etagMap.get("A"), '"abc123"')
  assertEquals(etagMap.get("B"), '"def456"')
})

Deno.test("parseMultistatus: Radicale lowercase d: prefix", () => {
  const xml = `<?xml version="1.0"?>
    <d:multistatus xmlns:d="DAV:">
      <d:response>
        <d:href>/u/c/X.ics</d:href>
        <d:propstat>
          <d:prop><d:getetag>"v1"</d:getetag></d:prop>
          <d:status>HTTP/1.1 200 OK</d:status>
        </d:propstat>
      </d:response>
    </d:multistatus>`
  const { hrefs, etagMap } = parseMultistatus(xml)
  assertEquals(hrefs, ["/u/c/X.ics"])
  assertEquals(etagMap.get("X"), '"v1"')
})

Deno.test("parseMultistatus: Stalwart uppercase D: prefix", () => {
  // Reproduces actual response from mail.antonshubin.com
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
    <D:multistatus xmlns:D="DAV:" xmlns:A="urn:ietf:params:xml:ns:caldav">
      <D:response>
        <D:href>/dav/cal/user/cal1.ics</D:href>
        <D:propstat>
          <D:prop><D:getetag>"e1"</D:getetag></D:prop>
          <D:status>HTTP/1.1 200 OK</D:status>
        </D:propstat>
      </D:response>
      <D:response>
        <D:href>/dav/cal/user/cal2.ics</D:href>
        <D:propstat>
          <D:prop><D:getetag>"e2"</D:getetag></D:prop>
          <D:status>HTTP/1.1 200 OK</D:status>
        </D:propstat>
      </D:response>
    </D:multistatus>`
  const { hrefs, etagMap } = parseMultistatus(xml)
  assertEquals(hrefs, ["/dav/cal/user/cal1.ics", "/dav/cal/user/cal2.ics"])
  assertEquals(etagMap.get("cal1"), '"e1"')
  assertEquals(etagMap.get("cal2"), '"e2"')
})

// ── parseCalendars ─────────────────────────────────────────────────────────

Deno.test("parseCalendars: Radicale returns calendar list", () => {
  const xml = `<?xml version="1.0"?>
    <multistatus xmlns="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
      <response>
        <href>/u/cal1/</href>
        <propstat>
          <prop>
            <resourcetype><collection/><C:calendar/></resourcetype>
            <displayname>Calendar One</displayname>
            <C:supported-calendar-component-set>
              <C:comp name="VTODO"/>
            </C:supported-calendar-component-set>
          </prop>
          <status>HTTP/1.1 200 OK</status>
        </propstat>
      </response>
    </multistatus>`
  const result = parseCalendars(xml)
  assertEquals(result.length, 1)
  assertEquals(result[0].href, "/u/cal1/")
  assertEquals(result[0].displayName, "Calendar One")
})

Deno.test("parseCalendars: Stalwart returns calendar list (multi-prefix, capital)", () => {
  // Reproduces real response from mail.antonshubin.com for /dav/cal/<email>/
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
    <D:multistatus xmlns:D="DAV:" xmlns:A="urn:ietf:params:xml:ns:caldav">
      <D:response>
        <D:href>/dav/cal/anton%40antonshubin.com/1.3%20Horizon/</D:href>
        <D:propstat>
          <D:prop>
            <D:resourcetype><D:collection/><A:calendar/></D:resourcetype>
            <D:displayname>1.3 Horizon</D:displayname>
            <A:supported-calendar-component-set>
              <A:comp name="VTODO"/><A:comp name="VEVENT"/>
            </A:supported-calendar-component-set>
          </D:prop>
          <D:status>HTTP/1.1 200 OK</D:status>
        </D:propstat>
      </D:response>
      <D:response>
        <D:href>/dav/cal/anton%40antonshubin.com/2.0%20Projects/</D:href>
        <D:propstat>
          <D:prop>
            <D:resourcetype><D:collection/><A:calendar/></D:resourcetype>
            <D:displayname>2.0 Projects</D:displayname>
            <A:supported-calendar-component-set>
              <A:comp name="VTODO"/><A:comp name="VEVENT"/>
            </A:supported-calendar-component-set>
          </D:prop>
          <D:status>HTTP/1.1 200 OK</D:status>
        </D:propstat>
      </D:response>
    </D:multistatus>`
  const result = parseCalendars(xml)
  assertEquals(result.length, 2)
  assertEquals(result[0].displayName, "1.3 Horizon")
  assertEquals(result[1].displayName, "2.0 Projects")
  assertEquals(result[0].href, "/dav/cal/anton%40antonshubin.com/1.3%20Horizon/")
})

Deno.test("parseCalendars: Stalwart filters out user principal home (regression)", () => {
  // The principal home has <D:collection/> but NOT <A:calendar/> in resourcetype.
  // It also exposes <supported-calendar-component-set/> and <calendar-color/>
  // (404 status) — substring "calendar" alone would falsely match these.
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
    <D:multistatus xmlns:D="DAV:" xmlns:A="urn:ietf:params:xml:ns:caldav">
      <D:response>
        <D:href>/dav/cal/anton%40antonshubin.com/</D:href>
        <D:propstat>
          <D:prop>
            <A:supported-calendar-component-set/>
            <calendar-color xmlns="http://apple.com/ns/ical/"/>
          </D:prop>
          <D:status>HTTP/1.1 404 Not Found</D:status>
        </D:propstat>
        <D:propstat>
          <D:prop>
            <D:resourcetype><D:collection/></D:resourcetype>
            <D:displayname>Anton Shubin</D:displayname>
          </D:prop>
          <D:status>HTTP/1.1 200 OK</D:status>
        </D:propstat>
      </D:response>
    </D:multistatus>`
  const result = parseCalendars(xml)
  assertEquals(result.length, 0, "principal home must not be a calendar")
})

Deno.test("parseCalendars: skips calendars without VTODO support", () => {
  const xml = `<?xml version="1.0"?>
    <multistatus xmlns="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
      <response>
        <href>/u/cal-events/</href>
        <propstat>
          <prop>
            <resourcetype><collection/><C:calendar/></resourcetype>
            <displayname>Events Only</displayname>
            <C:supported-calendar-component-set>
              <C:comp name="VEVENT"/>
            </C:supported-calendar-component-set>
          </prop>
          <status>HTTP/1.1 200 OK</status>
        </propstat>
      </response>
    </multistatus>`
  const result = parseCalendars(xml)
  assertEquals(result.length, 0, "VEVENT-only calendars excluded")
})

Deno.test("parseCalendars: extracts calendar-color", () => {
  const xml = `<?xml version="1.0"?>
    <multistatus xmlns="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav" xmlns:ICAL="http://apple.com/ns/ical/">
      <response>
        <href>/u/cal/</href>
        <propstat>
          <prop>
            <resourcetype><collection/><C:calendar/></resourcetype>
            <displayname>Colored</displayname>
            <ICAL:calendar-color>#FF0000FF</ICAL:calendar-color>
            <C:supported-calendar-component-set>
              <C:comp name="VTODO"/>
            </C:supported-calendar-component-set>
          </prop>
          <status>HTTP/1.1 200 OK</status>
        </propstat>
      </response>
    </multistatus>`
  const result = parseCalendars(xml)
  assertEquals(result.length, 1)
  assertEquals(result[0].color, "#FF0000FF")
})
