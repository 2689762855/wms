import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { containersCrudRouter } from './containers-crud';
import { containersActionsRouter } from './containers-actions';
import { containersReportsRouter } from './containers-reports';

export const containersRouter = Router();
containersRouter.use(authenticate);
containersRouter.use(containersCrudRouter);
containersRouter.use(containersActionsRouter);
containersRouter.use(containersReportsRouter);
