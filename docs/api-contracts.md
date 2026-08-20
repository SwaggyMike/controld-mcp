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
