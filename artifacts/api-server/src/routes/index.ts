import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import barbersRouter from "./barbers";
import appointmentsRouter from "./appointments";
import messagesRouter from "./messages";
import customersRouter from "./customers";
import pushTokensRouter from "./pushTokens";
import businessRouter from "./business";
import accountRouter from "./account";

const router: IRouter = Router();

router.use(healthRouter);
router.use(businessRouter);
router.use(accountRouter);
router.use("/auth", authRouter);
router.use("/barbers", barbersRouter);
router.use("/appointments", appointmentsRouter);
router.use("/messages", messagesRouter);
router.use("/customers", customersRouter);
router.use("/push-tokens", pushTokensRouter);

export default router;
