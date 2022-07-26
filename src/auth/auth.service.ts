import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { AuthDto } from './dto';
import * as argon from 'argon2';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime';
import { EOF } from 'dns';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}
  async signup(dto: AuthDto) {
    // generate the password hash
    const hash = await argon.hash(dto.password);
    //save the new user in the db
    try {
      const user = await this.prisma.user.create({
        data: {
          email: dto.email,
          hash,
        },
      });
      return this.signToken(user.id, user.email);
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ForbiddenException('credentials taken');
        }
      }
      throw error;
    }
  }

  async signin(dto: AuthDto) {
    // find the user by email address
    const user = await this.prisma.user.findUnique({
      where: {
        email: dto.email,
      },
    });

    // if the user does not exist throw exception
    if (!user) throw new ForbiddenException('Credentials incorrect');
    // compare password
    const pwMatches = await argon.verify(user.hash, dto.password);
    //if password incorrect throw exception.
    if (!pwMatches) throw new ForbiddenException('Credentials incorrect');

    // send the token created from the jwt.
    return this.signToken(user.id, user.email);
  }

  async signToken(
    userId: number,
    email: string,
  ): Promise<{ access_token: string }> {
    const payload = {
      sub: userId,
      email,
    };

    //getting the secret from the env.
    const secret = this.config.get('JWT_SECRET');

    // this is where the token is created using the payload and the secret
    const token = await this.jwt.signAsync(payload, {
      expiresIn: '15m',
      secret: secret,
    });

    // we return the token , when the function has been called.
    return {
      access_token: token,
    };
  }
}
