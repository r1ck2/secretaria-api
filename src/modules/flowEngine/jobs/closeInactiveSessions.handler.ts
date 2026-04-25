import { Op } from "sequelize";
import { FlowSession } from "../flowSession.entity";

const INACTIVITY_MINUTES = 10;

/**
 * Closes flow sessions that have had no activity for INACTIVITY_MINUTES.
 * "Activity" is tracked by updated_at — any message processed updates the session row.
 * Called by the cron job handler when job_name === "close_inactive_sessions_flow".
 */
export async function closeInactiveSessions(): Promise<void> {
  const cutoff = new Date(Date.now() - INACTIVITY_MINUTES * 60 * 1000);

  const inactive = await FlowSession.findAll({
    where: {
      status: { [Op.in]: ["active", "waiting_input"] },
      updated_at: { [Op.lt]: cutoff },
    },
    attributes: ["id", "phone_number", "status", "updated_at"],
  });

  if (!inactive.length) return;

  const ids = inactive.map((s) => s.id);

  await FlowSession.update(
    { status: "completed" },
    { where: { id: { [Op.in]: ids } } }
  );

  console.log(
    `[closeInactiveSessions] Closed ${ids.length} inactive session(s) ` +
    `(idle > ${INACTIVITY_MINUTES}min). IDs: ${ids.join(", ")}`
  );
}
