import { Router } from "express";
import { checkjwt } from "@/middlewares/jwt.middleware";
import { requireAdminMaster } from "@/middlewares/authorization.middleware";
import { listQueueJobs, getQueueJob, deleteQueueJob, retryQueueJob } from "@/modules/queueJob/queueJob.controller";

const router = Router();

router.get("/queue-jobs", checkjwt, requireAdminMaster, listQueueJobs);
router.get("/queue-jobs/:id", checkjwt, requireAdminMaster, getQueueJob);
router.delete("/queue-jobs/:id", checkjwt, requireAdminMaster, deleteQueueJob);
router.patch("/queue-jobs/:id/retry", checkjwt, requireAdminMaster, retryQueueJob);

export default router;
