import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as iam from 'aws-cdk-lib/aws-iam';

export interface ArchiveProps extends cdk.StackProps {
    prefix: string
    replications: string[]
}

export class IsaacStack extends cdk.Stack {
    constructor(scope: cdk.App, id: string, props: ArchiveProps) {
        super(scope, id, props);

        const key = new kms.Key(this, 'Key')
        const alias = key.addAlias('archive')
        const role = new iam.Role(this, 'ReplicationRole', {
            assumedBy: new iam.ServicePrincipal('s3.amazonaws.com'),
            path: '/service-role/'
        }),
        const s3Bucket = new s3.Bucket(this, 's3-BucketIsaac', {
            //bucketName: 'Isaac-Bucket'
            removalPolicy: cdk.RemovalPolicy.RETAIN,
            autoDeleteObjects: true,
            versioned: true,
            publicReadAccess: false,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            encryption: s3.BucketEncryption.KMS,
            cors: [
                {
                    allowedMethods: [
                        s3.HttpMethods.GET,
                        s3.HttpMethods.POST,
                        s3.HttpMethods.PUT,
                    ],
                    allowedOrigins: ['http://localhost:3000'],
                    allowedHeaders: ['*'],
                },
            ],
            lifecycleRules: [
                {
                    abortIncompleteMultipartUploadAfter: cdk.Duration.days(90),
                    expiration: cdk.Duration.days(365),
                    transitions: [
                        {
                            storageClass: s3.StorageClass.INFREQUENT_ACCESS,
                            transitionAfter: cdk.Duration.days(30),
                        },
                    ],
                },
            ],
        })
        // s3Bucket.grantRead(new iam.AccountRootPrincipal())
        s3Bucket.addToResourcePolicy(
            new iam.PolicyStatement({
                effect: iam.Effect.DENY,
                resources: [
                    s3Bucket.bucketArn
                ],
                actions: [
                    's3:DeleteBucket'
                ],
                principals: [
                    new iam.AnyPrincipal()
                ]
            }),
        )

            s3Bucket.addToResourcePolicy(
                new iam.PolicyStatement({
                    effect: iam.Effect.DENY,
                    resources: [
                        s3Bucket.arnForObjects('*')
                    ],
                    actions: [
                        's3:DeleteObjectVersion'
                    ],
                    principals: [
                        new iam.AnyPrincipal()
                    ]
                })
            ),
            role.addToPolicy(
                new iam.PolicyStatement({
                    resources: [
                        s3Bucket.bucketArn
                    ],
                    actions: [
                        's3:GetReplicationConfiguration',
                        's3:ListBucket'
                    ]
                })
            );

        role.addToPolicy(
            new iam.PolicyStatement({
                resources: [
                    s3Bucket.arnForObjects('*')
                ],
                actions: [
                    's3:GetObjectVersion',
                    's3:GetObjectVersionAcl',
                    's3:GetObjectVersionForReplication',
                    's3:GetObjectVersionTagging'
                ]
            })
        );

        role.addToPolicy(
            new iam.PolicyStatement({
                resources: [
                    key.keyArn
                ],
                actions: [
                    'kms:Decrypt'
                ]
            })
        );

        new cdk.CfnStackSet(this, "StackSet", {
            stackSetName: `${props.prefix}-archive-replication`,
            permissionModel: "SELF_MANAGED",
            parameters: [
                {
                    parameterKey: 'Prefix',
                    parameterValue: props.prefix
                },
                {
                    parameterKey: 'ReplicationRole',
                    parameterValue: role.roleArn
                }
            ],
            stackInstancesGroup: [
                {
                    regions: props.replications,
                    deploymentTargets: {
                        accounts: [this.account],
                    },
                },
            ],
            // templateBody:templateReplicationData,
        });

        role.addToPolicy(
            new iam.PolicyStatement({
                resources: props.replications.map(
                    region => `arn:aws:kms:${region}:${this.account}:alias/archive/replication`
                ),
                actions: [
                    'kms:Encrypt'
                ]
            })
        );

        role.addToPolicy(
            new iam.PolicyStatement({
                resources: props.replications.map(
                    region => `arn:aws:s3:::${props.prefix}-archive-replication-${region}/*`
                ),
                actions: [
                    's3:ReplicateDelete',
                    's3:ReplicateObject',
                    's3:ReplicateTags'
                ]
            })
        );

        role.addToPolicy(
            new iam.PolicyStatement({
                resources: props.replications.map(
                    region => `arn:aws:s3:::${props.prefix}-archive-replication-${region}`
                ),
                actions: [
                    's3:List*',
                    's3:GetBucketVersioning',
                    's3:PutBucketVersioning'
                ]
            })
        );
        const cfnBucket = s3Bucket.node.defaultChild as s3.CfnBucket;

        cfnBucket.replicationConfiguration = {
            role: role.roleArn,
            rules: props.replications.map(
                (region, index) => (
                    {
                        id: region,
                        destination: {
                            bucket: `arn:aws:s3:::${props.prefix}-archive-replication-${region}`,
                            encryptionConfiguration: {
                                replicaKmsKeyId: `arn:aws:kms:${region}:${this.account}:alias/archive/replication`
                            }
                        },
                        priority: index,
                        deleteMarkerReplication: {
                            status: 'Enabled'
                        },
                        filter: {
                            prefix: ''
                        },
                        sourceSelectionCriteria: {
                            sseKmsEncryptedObjects: {
                                status: 'Enabled'
                            }
                        },
                        status: 'Enabled'
                    }
                )
            )
        }

    }
}