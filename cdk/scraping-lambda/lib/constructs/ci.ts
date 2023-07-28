import { StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as codeBuild from 'aws-cdk-lib/aws-codebuild';
import * as iam from 'aws-cdk-lib/aws-iam';
import { ScopedAws } from 'aws-cdk-lib';


export interface CiProps extends StackProps {
    repositoryName: string;
    githubOwnerName: string;
}

export class Ci extends Construct {
    constructor(
        scope: Construct,
        id: string,
        props: CiProps
    ) {
        super(scope, id);

        const {
            repositoryName,
            githubOwnerName,
        } = props;
        const { accountId, region } = new ScopedAws(this);

        // codeBuild
        const gitHubSource = codeBuild.Source.gitHub({
            owner: githubOwnerName,
            repo: repositoryName,
            webhook: true,
            webhookFilters: [
                codeBuild.FilterGroup
                    .inEventOf(codeBuild.EventAction.PULL_REQUEST_CREATED)
                    .andBranchIs('main')
            ],
        });

        let snyk_build_project = new codeBuild.Project(this, 'snykBuild', {
            source: gitHubSource,
            buildSpec: codeBuild.BuildSpec.fromObject({
                "version": "0.2",
                "env": {
                    "parameter-store": {
                        "SNYK_ORG": "snyk-org-id",
                        "SNYK_TOKEN": "snyk-auth-code",
                    }
                },
                "phases": {
                    "install": {
                        "commands": [
                            "echo 'installing Snyk'",
                            "npm install -g snyk"
                        ]
                    },
                    "pre_build": {
                        "commands": [
                            "echo 'authorizing Snyk'",
                            "snyk config set api=$SNYK_TOKEN"
                        ]
                    },
                    "build": {
                        "commands": [
                            "echo 'starting scan'",
                            "pip install -r ./cdk/scraping-lambda/lambda/requirements.txt",
                            "snyk config set org=$SNYK_ORG",
                            `snyk test --file=./cdk/scraping-lambda/lambda/requirements.txt --project-name=${repositoryName} --package-manager=pip`
                        ]
                    },
                    "post_build": {
                        "commands": [
                            "echo ***build complete****"
                        ]
                    }
                }
            }),
            environment: {
                buildImage: codeBuild.LinuxBuildImage.STANDARD_5_0,
                computeType: codeBuild.ComputeType.SMALL
            }
        });

        snyk_build_project.addToRolePolicy(new iam.PolicyStatement({
            actions: ['ssm:GetParameters'],
            effect: iam.Effect.ALLOW,
            resources: [
                `arn:aws:ssm:${region}:${accountId}:parameter/snyk-org-id`,
                `arn:aws:ssm:${region}:${accountId}:parameter/snyk-auth-code`
            ]
        }));
    }
}