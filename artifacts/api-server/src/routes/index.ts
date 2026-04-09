import { Router, type IRouter } from "express";
import healthRouter from "./health";
import kaRouter from "./ka";

const router: IRouter = Router();

router.use(healthRouter);
router.use(kaRouter);

export default router;
