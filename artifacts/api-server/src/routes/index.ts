import { Router, type IRouter } from "express";
import authRouter from "./auth";
import healthRouter from "./health";
import kaRouter from "./ka";
import eventRemindersRouter from "./event-reminders";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use(kaRouter);
router.use("/ka", eventRemindersRouter);

export default router;
