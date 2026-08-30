import { Field, ID, ObjectType } from '@nestjs/graphql'


@ObjectType({ isAbstract: true})
export class AbstractModel {
    @Field(() => ID)
    id: string;

    @Field()
    createdAt: Date;
}