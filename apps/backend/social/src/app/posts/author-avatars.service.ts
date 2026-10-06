import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import {
  AUTH_PACKAGE_NAME,
  AUTH_SERVICE_NAME,
  AuthServiceClient,
} from '@roorin/proto';
import DataLoader from 'dataloader';
import { firstValueFrom, timeout } from 'rxjs';

@Injectable()
export class AuthorAvatarsService implements OnModuleInit {
  private readonly logger = new Logger(AuthorAvatarsService.name);
  private readonly loaders = new WeakMap<
    object,
    DataLoader<string, string | null>
  >();
  private authService!: AuthServiceClient;

  constructor(@Inject(AUTH_PACKAGE_NAME) private readonly client: ClientGrpc) {}

  onModuleInit() {
    this.authService =
      this.client.getService<AuthServiceClient>(AUTH_SERVICE_NAME);
  }

  getAvatar(context: object, authorId: string): Promise<string | null> {
    // Each GraphQL context owns its cache, so profile edits appear next request.
    let loader = this.loaders.get(context);
    if (!loader) {
      loader = new DataLoader((ids) => this.loadBatch(ids), {
        maxBatchSize: 100,
      });
      this.loaders.set(context, loader);
    }
    return loader.load(authorId);
  }

  private async loadBatch(ids: readonly string[]): Promise<(string | null)[]> {
    try {
      const response = await firstValueFrom(
        this.authService
          .getUserAvatars({ userIds: [...ids] })
          .pipe(timeout(1500)),
      );
      const avatars = new Map(
        (response.avatars ?? []).map((user) => [user.userId, user.avatarUrl]),
      );
      return ids.map((id) => avatars.get(id) || null);
    } catch {
      this.logger.warn(
        'Author avatars unavailable; returning initials fallback.',
      );
      return ids.map(() => null);
    }
  }
}
