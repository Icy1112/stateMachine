#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { IsaacStack } from '../lib/Isaac_Stack';

const prefix = 'Isaac'
const app = new cdk.App();
new IsaacStack(app, 'Isaac-cdk-stack', {
  stackName: `${prefix}-cdk-stack`,
  prefix,
  env: {
    region: process.env.CDK_DEFAULT_REGION,
    account: process.env.CDK_DEFAULT_ACCOUNT,
  },
  replications: [
      'us-west-2',
      'us-east-2'
  ],
});