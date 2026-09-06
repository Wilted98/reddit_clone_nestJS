import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { ClientGrpc } from '@nestjs/microservices';
import { catchError, map, Observable, of } from 'rxjs';
import {
  AUTH_PACKAGE_NAME,
  AUTH_SERVICE_NAME,
  AuthServiceClient,
} from '@roorin/proto';

/**
 * Guards a GraphQL resolver by resolving the Authentication cookie into a user
 * via a gRPC call to roorin-auth. Services never verify JWTs themselves - only
 * roorin-auth knows the signing secret, so revoking or changing the token
 * format is a one-service change.
 */
@Injectable()
export class GqlAuthGuard implements CanActivate, OnModuleInit {
  private readonly logger = new Logger(GqlAuthGuard.name);
  private authService!: AuthServiceClient;

  constructor(
    @Inject(AUTH_PACKAGE_NAME)
    private readonly client: ClientGrpc,
  ) {}

  onModuleInit(): void {
    this.authService =
      this.client.getService<AuthServiceClient>(AUTH_SERVICE_NAME);
  }

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = this.getRequest(context);
    const token =
      request.cookies?.Authentication ??
      request.headers?.authorization?.replace('Bearer ', '');

    if (!token) {
      return false;
    }

    return this.authService.authenticate({ token }).pipe(
      map((user) => {
        request.user = user;
        return true;
      }),
      catchError((error) => {
        // A rejected token is routine traffic, not an incident - log it as one
        // line, not a stack trace, or real failures drown in noise.
        //
        // KNOWN GAP: roorin-auth's passport guard rejects before the gRPC
        // handler runs, so a bad token arrives here as UNKNOWN/"Internal
        // server error" - indistinguishable from auth actually being down.
        // Fix when it matters by adding an RPC exception filter in roorin-auth
        // that maps UnauthorizedException to status UNAUTHENTICATED (16).
        this.logger.warn(
          `auth rejected: ${error?.details ?? error?.message ?? 'unknown'}`,
        );
        return of(false);
      }),
    );
  }

  private getRequest(context: ExecutionContext) {
    const gqlContext = GqlExecutionContext.create(context);
    return gqlContext.getContext().req;
  }
}
