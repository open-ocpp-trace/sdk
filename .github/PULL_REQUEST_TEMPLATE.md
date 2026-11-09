<!--
Thanks for contributing. See CONTRIBUTING.md:
https://github.com/open-ocpp-trace/sdk/blob/main/CONTRIBUTING.md

A change to the trace format (schema, fields, enum values, validation rules,
fixtures) is proposed in open-ocpp-trace/specification first:
https://github.com/open-ocpp-trace/specification
-->

## Summary

<!-- What changes and why, for a reviewer who has not read the issue. -->

Closes #

## Checks run

<!-- Keep the lines that apply and paste the summary of each result. -->

- [ ] `conformance/fetch.sh`
- [ ] `vp check` (from `typescript/`)
- [ ] `vp test` (from `typescript/`)
- [ ] `vp run -r pack` (from `typescript/`)
- [ ] `vp run smoke` (from `typescript/`)
- [ ] `shellcheck` on changed shell scripts

## Checklist

- [ ] Behaviour changes come with a test that fails without them.
- [ ] Every commit is signed off (`git commit -s`, see
      [DCO](https://github.com/open-ocpp-trace/sdk/blob/main/CONTRIBUTING.md#developer-certificate-of-origin-dco)).
- [ ] This does not change the trace format, or the change is already merged
      in [open-ocpp-trace/specification](https://github.com/open-ocpp-trace/specification)
      and the corpus is re-pinned here.
- [ ] Package README and
      [docs/compatibility.md](https://github.com/open-ocpp-trace/sdk/blob/main/docs/compatibility.md)
      are updated where users see the change.
- [ ] A change visible to package users is described in the summary above
      (breaking: `!` and a `BREAKING CHANGE:` footer). `CHANGELOG.md` is
      written in the release pull request, not here.
