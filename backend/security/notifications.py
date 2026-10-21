"""Durable at-least-once signup notifications. SMTP uses verified implicit TLS."""

import asyncio
import logging
import smtplib
import ssl
from email.message import EmailMessage
from security.service import AuthService, now

log = logging.getLogger(__name__)


def deliver_pending(auth: AuthService) -> int:
    cfg = auth.settings
    if not cfg.smtp_host:
        return 0
    sent = 0
    for _ in range(20):
        with auth.connect(write=True) as db:
            row = db.execute(
                "SELECT * FROM auth_outbox WHERE sent_at IS NULL AND next_attempt_at<=? ORDER BY id LIMIT 1",
                (now(),),
            ).fetchone()
            if not row:
                break
            # Claim for 60s; a crash is retried. No SQLite lock held during SMTP.
            db.execute(
                "UPDATE auth_outbox SET attempts=attempts+1,next_attempt_at=? WHERE id=?",
                (now() + 60, row["id"]),
            )
        message = EmailMessage()
        message["Subject"] = "DAVA account approval requested"
        message["From"] = cfg.smtp_from
        message["To"] = row["recipient"]
        message["Message-ID"] = (
            f"<dava-signup-{row['id']}@{cfg.smtp_from.split('@')[-1]}>"
        )
        message.set_content(
            f"A signup needs review.\nName: {row['applicant_name']}\nEmail: {row['applicant_email']}\n\nSign in to DAVA and open Account to approve or reject.\n"
        )
        try:
            with smtplib.SMTP_SSL(
                cfg.smtp_host,
                cfg.smtp_port,
                timeout=15,
                context=ssl.create_default_context(),
            ) as smtp:
                smtp.login(cfg.smtp_user, cfg.smtp_password)
                smtp.send_message(message)
        except (OSError, smtplib.SMTPException):
            # No addresses, credentials or provider response bodies in logs.
            log.warning(
                "Admin notification delivery failed; outbox item %s will retry",
                row["id"],
            )
            continue
        with auth.connect(write=True) as db:
            db.execute(
                "UPDATE auth_outbox SET sent_at=? WHERE id=?", (now(), row["id"])
            )
        sent += 1
    return sent


async def notification_loop(auth):
    while True:
        await asyncio.to_thread(deliver_pending, auth)
        await asyncio.sleep(30)
