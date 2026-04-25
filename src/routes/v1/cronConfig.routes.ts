import { Router } from "express";
import { checkjwt } from "@/middlewares/jwt.middleware";
import {
  listCronConfigs,
  getCronConfig,
  createCronConfig,
  updateCronConfig,
  deleteCronConfig,
  reloadJobsController,
} from "@/modules/cronConfig/cronConfig.controller";

const router = Router();

router.get("/cron-configs", checkjwt, listCronConfigs);
router.get("/cron-configs/:id", checkjwt, getCronConfig);
router.post("/cron-configs/reload-jobs", checkjwt, reloadJobsController);
router.post("/cron-configs", checkjwt, createCronConfig);
router.put("/cron-configs/:id", checkjwt, updateCronConfig);
router.delete("/cron-configs/:id", checkjwt, deleteCronConfig);

export default router;
