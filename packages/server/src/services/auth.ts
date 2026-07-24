import passport from 'passport';
import { Strategy as GoogleStrategy, Profile } from 'passport-google-oauth20';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/database.js';

export function setupPassport(): void {
  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  passport.deserializeUser((id: string, done) => {
    try {
      const db = getDb();
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
      done(null, user ?? null);
    } catch (err) {
      done(err, null);
    }
  });

  const clientID = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const callbackURL = process.env.GOOGLE_CALLBACK_URL ?? 'http://localhost:3001/auth/google/callback';

  if (clientID && clientSecret) {
    passport.use(
      new GoogleStrategy(
        { clientID, clientSecret, callbackURL },
        async (_accessToken, _refreshToken, profile: Profile, done) => {
          try {
            const db = getDb();
            const email = profile.emails?.[0]?.value;
            if (!email) {
              return done(new Error('No email from Google profile'), undefined);
            }

            let user = db.prepare('SELECT * FROM users WHERE google_id = ?').get(profile.id) as any;
            if (!user) {
              user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;
            }

            if (user) {
              db.prepare(
                'UPDATE users SET google_id = ?, name = ?, avatar_url = ?, updated_at = datetime(\'now\') WHERE id = ?'
              ).run(profile.id, profile.displayName, profile.photos?.[0]?.value ?? null, user.id);
            } else {
              const id = uuidv4();
              db.prepare(
                'INSERT INTO users (id, google_id, email, name, avatar_url) VALUES (?, ?, ?, ?, ?)'
              ).run(id, profile.id, email, profile.displayName, profile.photos?.[0]?.value ?? null);
              user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
            }

            done(null, user);
          } catch (err) {
            done(err, undefined);
          }
        }
      )
    );
  } else {
    console.warn('Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.');
  }
}
