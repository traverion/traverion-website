# P9.35 — Supplier Verification Recovery

| | |
|---|---|
| Verdict | **PASS** |
| Date | 2026-11-18T13:15:43.800Z |
| Fixture | `p935-biz-mwm59ant@traverion.invalid` |
| LIVE create / allowlist / money | **Not enabled** |

## Checks

- PASS — **safety_flags_off**: `{"stripe_connect_transfers_enabled":0,"payout_execution_enabled":0,"live_custom_onboarding_enabled":0}`
- PASS — **em_global_rejected**: `{"before":"rejected","after":"rejected","feedbackPreview":"Business profile fields match YTJ for EM Global Oy (3567289-4), but the uploaded company-registration.png is a Royal Nor"}`
- PASS — **create_user**: `{"email":"p935-biz-mwm59ant@traverion.invalid","userId":"b5331a38-6bf9-43f4-97cb-8f7edfc0c3fb"}`
- PASS — **ensure_profile**: `"ok"`
- PASS — **submit_pending**: `{"submittedAt":"2026-11-18T13:15:37.215Z"}`
- PASS — **admin_sign_in**: `"b6c7cc90-021c-4b6c-88df-2d6386afe305"`
- PASS — **request_changes**: `{"sent":true,"skipped":false,"providerMessageId":"01a1eecc-7eba-7817-b13c-410327b18228","to":"p935-biz-mwm59ant@traverion.invalid"}`
- PASS — **rejected_state**: `{"status":"rejected","path":"b5331a38-6bf9-43f4-97cb-8f7edfc0c3fb/company-registration-marketing-poster.png"}`
- PASS — **supplier_sign_in**: `"b5331a38-6bf9-43f4-97cb-8f7edfc0c3fb"`
- PASS — **supplier_replace_resubmit**: `{"replacedPath":"b5331a38-6bf9-43f4-97cb-8f7edfc0c3fb/company-registration-fixture-extract.pdf","resubmitAt":"2026-11-18T13:15:41.939Z"}`
- PASS — **resubmit_cleared_feedback**: `{"verification_status":"pending","business_verification_feedback":null,"company_registration_document_path":"b5331a38-6bf9-43f4-97cb-8f7edfc0c3fb/company-registration-fixture-extract.pdf","verification_submitted_at":"2026-11-18T13:15:41.939+00:00"}`
- PASS — **admin_approve_fixture**: `{"sent":true,"skipped":false,"providerMessageId":"01a1eecc-8478-74dd-a11e-dc049157e23d","to":"p935-biz-mwm59ant@traverion.invalid"}`
- PASS — **fixture_verified**: `{"verification_status":"verified"}`
- PASS — **audit_trail**: `{"count":3}`
- PASS — **cleanup_fixture**: `"b5331a38-6bf9-43f4-97cb-8f7edfc0c3fb"`
- PASS — **em_global_still_rejected_not_approved**: `{"status":"rejected","hasFeedback":true}`

## Remaining blockers (production)

- EM Global Oy still needs a genuine PRH/YTJ registration extract from the supplier (marketing poster remains unacceptable).
- Do not approve EM Global or enable LIVE Connect create/allowlist until a real extract is reviewed.
- Stripe KYC / payout readiness remain separate and untouched by this mission.
