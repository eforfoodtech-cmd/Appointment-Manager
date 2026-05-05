import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import barbersRouter from "./barbers";
import appointmentsRouter from "./appointments";
import messagesRouter from "./messages";
import customersRouter from "./customers";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/barbers", barbersRouter);
router.use("/appointments", appointmentsRouter);
router.use("/messages", messagesRouter);
router.use("/customers", customersRouter);

export default router;
