import { Router, Request, Response } from "express";
import { checkjwt } from "@/middlewares/jwt.middleware";
import { ServicePrice } from "@/modules/servicePrice/servicePrice.entity";

const router = Router();

/** GET /api/v1/service-prices — list for authenticated professional */
router.get("/service-prices", checkjwt, async (req: Request, res: Response) => {
  try {
    const items = await ServicePrice.findAll({
      where: { user_id: req.userId },
      order: [["name", "ASC"]],
    });
    return res.json({ success: true, data: items });
  } catch (e: any) {
    return res.status(400).json({ success: false, message: e.message });
  }
});

/** POST /api/v1/service-prices */
router.post("/service-prices", checkjwt, async (req: Request, res: Response) => {
  try {
    const { name, price, details, duration_minutes } = req.body;
    if (!name || price === undefined) {
      return res.status(422).json({ success: false, message: "name e price são obrigatórios." });
    }
    const item = await ServicePrice.create({ user_id: req.userId, name, price, details, duration_minutes } as any);
    return res.status(201).json({ success: true, data: item });
  } catch (e: any) {
    return res.status(400).json({ success: false, message: e.message });
  }
});

/** PUT /api/v1/service-prices/:id */
router.put("/service-prices/:id", checkjwt, async (req: Request, res: Response) => {
  try {
    const item = await ServicePrice.findOne({ where: { id: req.params.id, user_id: req.userId } });
    if (!item) return res.status(404).json({ success: false, message: "Não encontrado." });
    await item.update(req.body);
    return res.json({ success: true, data: item });
  } catch (e: any) {
    return res.status(400).json({ success: false, message: e.message });
  }
});

/** DELETE /api/v1/service-prices/:id */
router.delete("/service-prices/:id", checkjwt, async (req: Request, res: Response) => {
  try {
    const item = await ServicePrice.findOne({ where: { id: req.params.id, user_id: req.userId } });
    if (!item) return res.status(404).json({ success: false, message: "Não encontrado." });
    await item.destroy();
    return res.json({ success: true });
  } catch (e: any) {
    return res.status(400).json({ success: false, message: e.message });
  }
});

export default router;
