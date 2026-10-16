# EV Charging

ParkFlow uses PostgreSQL/Prisma, not MongoDB. EV stations follow the existing
latitude/longitude storage pattern. The repository includes the verified
`ramallah_ev_charging_stations.json` dataset with 11 PalEV stations and 12
installed connectors in Ramallah. It is imported explicitly and is not seed data.

## Deployment and verified ingestion

From `server`, apply the existing migrations including
`20260928010000_ev_charging` using `npm.cmd run db:migrate`, generate the client
using `npm.cmd run db:generate`, and restart the server. On Windows, stop the
process holding the Prisma query engine before regenerating if an EPERM rename
occurs.

Import the verified Ramallah dataset from `server` with:

```powershell
npx.cmd tsx prisma/importEvStations.ts ..\ramallah_ev_charging_stations.json
```

The following is a valid JSON **insertion template, not an actual station**.
The coordinates, connector data, verification date and source are illustrative
format values only. Do not import this template unchanged. The importer validates
structure, not the truth of the supplied source; the operator must verify it.

```json
[
  {
    "id": "replace-with-stable-source-id",
    "name": "Replace with verified station name",
    "operatorName": "Replace with verified operator",
    "latitude": 0,
    "longitude": 0,
    "address": "Replace with verified address",
    "city": "Replace with verified city",
    "connectors": [{ "type": "ccs_2", "powerKw": 50, "quantity": 1 }],
    "status": "unknown",
    "accessType": "unknown",
    "sourceName": "Replace with identifiable source",
    "sourceUrl": "https://example.org/replace-with-real-source",
    "lastVerifiedAt": "2026-09-28T00:00:00Z"
  }
]
```

Optional fields: operatorName, address, city, pricingText, openingHoursText, phone,
sourceUrl. Optional fields should be omitted if unknown, not filled with empty
strings. Phone must contain 7–15 digits, at most 32 characters, start/end with a digit (optional leading
`+`), and contain only digits, spaces, parentheses or hyphens. Source URLs must
be HTTP(S) without embedded credentials. sourceName and lastVerifiedAt are required
for ingestion, and verification dates cannot be in the future. The Ramallah
dataset's `1.80 NIS per minute` pricing text is an estimate; the station details
tell users to confirm the current price with PalEV before charging.

Connector types: type_2, ccs_2, chademo, gb_t, type_1, other. Power: >0 and <=1000
kW. Quantity: positive integer <=10000. Up to 40 connector entries. Operational
stations require at least one connector. These are static installed connector
quantities, never available ports.

Status: operational, temporarily_unavailable, planned, unknown. Access: public,
customers_only, private, unknown. Other text values are trimmed and length-limited.
Import validates the entire array before writing; up to 1000 stations are upserted
transactionally by stable ID, with connector replacement. Reimporting an ID updates
that station rather than duplicating it. It does not remove stations absent from
the file. There is no public create/update/delete API.

## API

Public `GET /api/v1/ev-stations` requires numeric north/south/east/west, ordered
and spanning at most 2 degrees on each axis. Optional filters: connectorType,
minPowerKw (0–1000 exclusive of zero), status. Invalid input uses the existing
validation/error handler. The response is `{stations: EvChargingStation[], truncated: boolean}`.
Each DTO contains station display fields, simple coordinates, timestamps and
`connectors: [{type, powerKw, quantity}]`; connector internal IDs are not exposed.

Results require sourceName and a non-future lastVerifiedAt. Coordinate indexes,
status/latitude index, and station/type/power connector index support bounded
queries. Results are stable-ID ordered and capped at 200. Connector and power
filters match the **same** connector. At dense areas, zoom in when truncated.

## Frontend and routing

The dedicated Zustand store owns stations, selection, filters, loading/error,
lastLoadedBounds and truncation. EV requests are enabled only for the EV primary
category, debounced 450ms after settled map bounds, expanded 15% on each edge,
and reused for covered views for five minutes. Request generations ignore late
responses after filtering, switching categories or unmounting. There is no polling.
Very wide views (>1.5 degrees/axis) ask the user to zoom in; antimeridian-crossing
bounds are not supported. Marker counts are filtered to the visible area.

Enabling the existing availability flag removes Coming soon and permits persisted
EV selection. Road Reports remain an independent overlay. Business Offers,
Car Services and Roadside Help remain unavailable. Leaving EV closes its sheet
and selection but preserves route, GPS and camera; valid station data is retained.

RouteDestination discriminates parking and EV stations and retains destination
metadata. Both use the same real routing hook, geometry and alternative/impact
assessment. The parking-only start action remains parking-only. EV details can
be reopened from the route panel, including after returning to Parking; this
explicit action switches back to EV. Closing station details never clears the route.

Existing routing failure/fallback behavior is unchanged; only OSRM geometry is
drawn. Report impact assessment retains the existing limitation: only reports
loaded for the map area are assessed, not a new whole-route corridor fetch.
Status styling is operational status, not live availability. Both native maps and
the centered Leaflet Web shell use the EV bolt marker and existing BottomSheet.

## Manual verification (not executed automatically)

1. Start the migrated server and app. In Layers, check EV is enabled without
   Coming soon, select it, and confirm parking markers and nearby parking panel
   disappear. Move the map, check loading, and zoom far out for the zoom-in hint.
2. Toggle Road Reports off/on: EV stays selected, its markers remain unchanged,
   and the layer badge changes between 1 and 2. Verify report creation, details,
   duplicate handling and voting remain functional. Disabled categories/offers
   must stay disabled. Reload and verify EV category persistence.
3. Import independently verified records only. Move to their real coordinates;
   inspect the bolt markers and selected styling for operational, unavailable,
   planned and unknown stations. Select a station: check operator/address,
   status, access, connector type/power/installed quantity, source, verification,
   and optional pricing/hours/phone. Unknown optional rows should be absent.
4. Use Filters for connector and 22/50/100/150+ kW and status; confirm conjunction,
   active-filter count and Reset. Pan slightly inside cached bounds (no refetch),
   then outside (one debounced load). Quickly change filters/categories: stale
   responses must not replace current results or selection.
5. Set an existing manual test origin in development or explicitly allow GPS.
   Show Route: check actual road geometry, distance/duration and report warnings.
   Where OSRM supplies alternatives and a report affects the original route,
   check alternative suggestion, selection and return to original. Toggle report
   visibility and confirm impact assessment is still active.
6. Close station details: the route remains. Reopen via Station details. Switch
   to Parking: EV markers/details disappear without camera/GPS/route reset;
   parking selection and ZoneSheet work. Start a parking route and verify its
   original start-parking action. EV routes must have no charging/session action.
7. Stop the server, move outside cached bounds and confirm the retryable error;
   restart and Retry. Empty results must never be an error. Verify phone/source
   actions only appear for valid values and failed links show a concise message.
8. Repeat in English and Arabic (LTR/RTL) on Web within the centered app shell,
   Android and iOS. Confirm no live port count, reservations, payment, reviews,
   check-ins or automatic navigation. No automated/browser tests were run.
