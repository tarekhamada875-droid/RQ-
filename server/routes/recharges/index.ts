import { Router } from 'express';
import { directRechargeRouter } from './directRecharge';
import { requestApprovalRouter } from './requestApproval';
import { manualTopupRouter } from './manualTopup';
import { selfSubscriptionRouter } from './selfSubscription';
import { referralRewardsRouter } from './referralRewards';

const rechargeRouter = Router();

rechargeRouter.use(directRechargeRouter);
rechargeRouter.use(requestApprovalRouter);
rechargeRouter.use(manualTopupRouter);
rechargeRouter.use(selfSubscriptionRouter);
rechargeRouter.use(referralRewardsRouter);

export default rechargeRouter;
export {
  directRechargeRouter,
  requestApprovalRouter,
  manualTopupRouter,
  selfSubscriptionRouter,
  referralRewardsRouter
};
