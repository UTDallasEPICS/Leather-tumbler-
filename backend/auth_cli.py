"""One-time first-admin bootstrap. Never accepts passwords on the command line."""

import argparse
import getpass
from schemas.auth import SignupIn
from security.config import AuthSettings
from security.notifications import deliver_pending
from security.service import AuthService


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["seed-admin", "deliver-notifications"])
    parser.add_argument("--db", required=True)
    parser.add_argument("--email")
    parser.add_argument("--name")
    args = parser.parse_args()
    auth = AuthService(args.db, AuthSettings.from_env())
    if args.command == "seed-admin":
        password = getpass.getpass("Admin password (15–128 characters): ")
        if password != getpass.getpass("Confirm password: "):
            parser.error("Passwords do not match")
        try:
            user = SignupIn(email=args.email, name=args.name, password=password)
            result = auth.seed(
                str(user.email), user.name, user.password.get_secret_value()
            )
        except ValueError:
            parser.error("Invalid signup fields, or bootstrap already consumed")
        print(f"Created first sysadmin {result['id']}. Bootstrap consumed.")
    else:
        print(f"Delivered {deliver_pending(auth)} notification(s).")


if __name__ == "__main__":
    main()
