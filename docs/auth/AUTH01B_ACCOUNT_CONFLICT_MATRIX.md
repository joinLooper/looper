# Account Conflict Matrix

| Situation | Observed / required |
| --- | --- |
| Existing Player LINE identity → same Account staff membership | Existing generic merchant session coexists; player/merchant cookie isolation verified on both engines |
| Existing Staff Account has no player profile → LINE bound → later Player login | SQLite500 / PG409; all inventoried tables unchanged; STOP D1 |
| Subject already linked to different Account | DB unique constraint blocks reassignment, original Account preserved; ACCOUNT_LINK_CONFLICT application response not implemented |
| Google identity on target Account | Must retain unchanged; no Google code/schema/identity was modified in this batch |
| Different LINE Provider | Never infer same person; actual provider mismatch not observed, Console not accessed |
| Multiple branch staff memberships | Scope selection policy pending D2; no automatic all-account role aggregation |
| Staff membership revoked but Account has owner membership | Generic session still authorizes owner branch; future staff session must not inherit it |

No migration of resources, no account merge, no real identity records were accessed. DB constraint evidence does not prove complete application-level binding security.
