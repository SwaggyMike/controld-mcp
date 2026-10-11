# Control D API contracts

The official API is unversioned. Authentication is `Authorization: Bearer <token>`.

Officially documented starting points:

- <https://docs.controld.com/reference/get-started>
- <https://docs.controld.com/reference/get-profiles>
- <https://docs.controld.com/reference/get-devices>
- <https://docs.controld.com/reference/get-access>
- <https://docs.controld.com/reference/modify-filters-in-batch>
- Complete index: <https://docs.controld.com/llms.txt>

The profile pause, custom-rule, proxy catalog, and activity-log calls used here are current first-party dashboard contracts that are not all covered by the small public reference. They are isolated in `src/operations.ts` and `src/client.ts` so a dashboard change has a small repair surface.

Activity logs require Full Analytics. The server never persists activity records.

## Domain verdict (`check_domain`)

`GET https://dns.controld.com/{endpointId}?name=<domain>&type=A&controld=1&no_log=1` with `Accept: application/dns+json`. This is the endpoint's public DNS-over-HTTPS resolver, so no token is sent. With `controld=1` the JSON answer carries `controld.verdict`: `verdictAction` (`"0"` block, `"1"` bypass, `"2"` spoof, `"3"` redirect), `verdictSource` (`bl` filter, `svc` service, `rules` custom rule, `default` default rule), `verdictMatch`, and `profileID`. No verdict means no policy matched. Do not infer blocks from `RCODE`: a profile that answers blocks with `0.0.0.0` returns `RCODE` 0.

## Rule toggle (`set_rules_enabled`)

`PUT /profiles/{profileId}/rules/{hostname}` with only `{"status": 0|1}`. Control D keeps the rule's action and redirect target for a status-only update; restating `do` on a redirect rule is rejected (`400 40003`).
