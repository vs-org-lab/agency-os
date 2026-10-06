import { describe, expect, it } from 'vitest';
import { parseInvitationFragment } from './invitation-fragment';

describe('parseInvitationFragment', () => {
  it('reads tokens from an invite fragment', () => {
    expect(
      parseInvitationFragment(
        '#access_token=aaa.bbb.ccc&expires_in=3600&refresh_token=r1&token_type=bearer&type=invite',
      ),
    ).toEqual({ accessToken: 'aaa.bbb.ccc', refreshToken: 'r1' });
  });

  it('ignores fragments of other types or with missing tokens', () => {
    expect(parseInvitationFragment('#access_token=a&refresh_token=r&type=recovery')).toBeNull();
    expect(parseInvitationFragment('#access_token=a&type=invite')).toBeNull();
    expect(parseInvitationFragment('')).toBeNull();
  });

  it('reads provider errors from the fragment', () => {
    expect(parseInvitationFragment('#error=access_denied&error_code=otp_expired')).toBeNull();
  });
});
