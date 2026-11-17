# Emergency access and downtime procedure

**Status:** draft for the facility to adopt (HIPAA 164.312(a)(2)(ii) emergency access;
164.308(a)(7) contingency plan).

AfyaFlow supports triage; it never replaces clinical judgement. Patient care must
continue when it is unavailable.

## If AfyaFlow is unavailable

1. Continue triage on paper using the facility's standard triage protocol and forms.
   Do not wait for the system.
2. Record arrival time, observations and the triage decision on paper, with the
   clinician's name.
3. Tell the shift lead and the system operator.
4. When AfyaFlow returns, enter the patients still in the department through normal
   registration. Note in the presenting complaint that the record was entered after
   downtime. Paper records remain the source of truth for decisions made during
   downtime.

Already-loaded browsers can still capture registrations offline; these sync when the
connection returns (see the user guide, section 9). Clinical decisions always require
the server.

## If staff cannot sign in

| Situation | Who acts | How |
| --- | --- | --- |
| Forgotten PIN, or PIN may be known to others | Any administrator | Staff Accounts → Reset PIN (new PIN shown once) |
| Staff member locked out after wrong PINs | Wait 15 minutes, or administrator resets the PIN | |
| Lost or shared device still signed in | Administrator | Staff Accounts → End sessions |
| Administrator lost their authenticator phone | System operator | `staff-admin remove-mfa`, then `enroll-mfa` with the administrator present |
| No administrator can sign in | System operator | `staff-admin reset-pin` / `enroll-mfa` on the server (deploy/ec2/README.md) |

There is no "break-glass" override that bypasses sign-in: every role that may view
patient data already can once signed in, and the paths above restore access within
minutes. All of them are audited.

## If data is lost or corrupted

The system operator restores the most recent off-host backup (deploy/ec2/README.md,
"Off-host backups"). Backups are daily, so up to one day of entries may need to be
re-entered from paper records.
