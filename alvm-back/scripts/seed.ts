/**
 * Seed de DÉVELOPPEMENT / démonstration — multi-tenant.
 *
 * Données fictives (domaines `.test`, RFC 2606). Jamais sur une base de
 * production : la production est amorcée par `create-super-admin`, puis les
 * associations sont créées depuis la super administration.
 *
 *   pnpm db:migrate && pnpm db:seed
 *
 * Crée :
 *   - l'espace de plateforme et un SUPER_ADMIN (superadmin@plateforme.test) ;
 *   - l'association « alvm » (jeu complet : personnel, familles, camps, inscriptions) ;
 *   - l'association « asso-demo » (jeu réduit) — elle réutilise volontairement
 *     l'email d'un parent d'« alvm » : deux comptes distincts, isolés par la RLS.
 * Mot de passe de tous les comptes : SEED_PASSWORD (défaut « Test1234!Seed »).
 */
import { hash } from 'bcryptjs';
import { prisma } from '@back/db';
import { actAsOrganization, withDbContext, type Db } from '@back/db-context';
import { provisionOrganization } from '@back/services/organization.service';

const PASSWORD = process.env.SEED_PASSWORD ?? 'Test1234!Seed';

type ChildData = {
  first: string;
  last: string;
  birth: string;
  gender: 'MALE' | 'FEMALE';
  ecole: string;
  emergName: string;
  emergPhone: string;
  emergRelation: string;
  parentIndex: number;
};

type CampDef = {
  name: string;
  description: string;
  campType: string;
  location: string;
  maxCapacity: number;
  offsetDays: number;
  durationDays: number;
  deadlineOffset: number;
  pricePerDay: number;
  status: 'DRAFT' | 'PUBLISHED';
  themes?: string[];
};

const addDays = (date: Date, days: number): Date => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

/**
 * Un hash par compte : `accounts (provider, provider_account_id)` est unique
 * et `provider_account_id` porte le hash bcrypt (sel propre à chaque compte).
 */
async function createAccount(
  db: Db,
  data: { email: string; name: string; role: 'ADMIN' | 'STAFF' | 'PARENT' },
) {
  return db.user.create({
    data: {
      email: data.email,
      name: data.name,
      role: data.role,
      emailVerified: new Date(),
      accounts: {
        create: {
          type: 'credentials',
          provider: 'credentials',
          providerAccountId: await hash(PASSWORD, 10),
        },
      },
    },
    select: { id: true },
  });
}

async function ensurePlatform(passwordHash: string): Promise<string> {
  return withDbContext({ scope: 'platform' }, async (db) => {
    const existing = await db.organization.findFirst({
      where: { kind: 'PLATFORM' },
      select: { id: true },
    });
    const platform =
      existing ??
      (await db.organization.create({
        data: { slug: 'platform', name: 'Plateforme', kind: 'PLATFORM' },
        select: { id: true },
      }));
    const email = 'superadmin@plateforme.test';
    if (!(await db.user.findFirst({ where: { organizationId: platform.id, email } }))) {
      await db.user.create({
        data: {
          organizationId: platform.id,
          email,
          name: 'Super administrateur',
          role: 'SUPER_ADMIN',
          emailVerified: new Date(),
          accounts: {
            create: {
              type: 'credentials',
              provider: 'credentials',
              providerAccountId: passwordHash,
            },
          },
        },
      });
    }
    const superAdmin = await db.user.findFirstOrThrow({
      where: { organizationId: platform.id, email },
      select: { id: true },
    });
    return superAdmin.id;
  });
}

/** Provisionne l'association (code de production) si elle n'existe pas encore. */
async function ensureOrganization(
  actorId: string,
  input: { slug: string; name: string; adminEmail: string; adminName: string },
): Promise<string | null> {
  return withDbContext({ scope: 'platform' }, async (db) => {
    const existing = await db.organization.findUnique({ where: { slug: input.slug } });
    if (existing) {
      console.log(`   = ${input.slug} existe déjà, ignorée`);
      return null;
    }
    const organization = await provisionOrganization(
      db,
      {
        name: input.name,
        slug: input.slug,
        admin: { name: input.adminName, email: input.adminEmail, password: PASSWORD },
      },
      actorId,
    );
    await actAsOrganization(db, null);
    return organization.id;
  });
}

async function seedAlvm(organizationId: string) {
  await withDbContext({ scope: 'tenant', organizationId }, async (db) => {
    const staffData = [
      {
        email: 'sophie.martin@alvm.test',
        name: 'Sophie Martin',
        first: 'Sophie',
        last: 'Martin',
        phone: '+687 75 12 34',
      },
      {
        email: 'thomas.dubois@alvm.test',
        name: 'Thomas Dubois',
        first: 'Thomas',
        last: 'Dubois',
        phone: '+687 76 23 45',
      },
      {
        email: 'marie.leclerc@alvm.test',
        name: 'Marie Leclerc',
        first: 'Marie',
        last: 'Leclerc',
        phone: '+687 77 34 56',
      },
    ];
    const staffIds: string[] = [];
    for (const s of staffData) {
      const user = await createAccount(db, { email: s.email, name: s.name, role: 'STAFF' });
      await db.staffMember.create({
        data: {
          userId: user.id,
          firstName: s.first,
          lastName: s.last,
          phone: s.phone,
          email: s.email,
        },
      });
      staffIds.push(user.id);
    }

    const parentsData = [
      {
        email: 'martin.dupont@familles.test',
        name: 'Martin Dupont',
        first: 'Martin',
        last: 'Dupont',
        phone: '+687 75 12 34',
        address: '15 Rue de la Baie',
        city: 'Nouméa',
        postal: '98800',
      },
      {
        email: 'sophie.leblanc@familles.test',
        name: 'Sophie Leblanc',
        first: 'Sophie',
        last: 'Leblanc',
        phone: '+687 75 23 45',
        address: '22 Avenue du Maréchal Foch',
        city: 'Nouméa',
        postal: '98800',
      },
      {
        email: 'jp.bernard@familles.test',
        name: 'Jean-Pierre Bernard',
        first: 'Jean-Pierre',
        last: 'Bernard',
        phone: '+687 75 34 56',
        address: '8 Rue de la République',
        city: 'Dumbéa',
        postal: '98835',
      },
      {
        email: 'claire.rousseau@familles.test',
        name: 'Claire Rousseau',
        first: 'Claire',
        last: 'Rousseau',
        phone: '+687 75 45 67',
        address: '31 Boulevard Vauban',
        city: 'Nouméa',
        postal: '98800',
      },
      {
        email: 'pierre.lambert@familles.test',
        name: 'Pierre Lambert',
        first: 'Pierre',
        last: 'Lambert',
        phone: '+687 75 56 78',
        address: '12 Rue Georges Clemenceau',
        city: 'Mont-Dore',
        postal: '98809',
      },
      {
        email: 'marie.moreau@familles.test',
        name: 'Marie Moreau',
        first: 'Marie',
        last: 'Moreau',
        phone: '+687 75 67 89',
        address: '45 Avenue James Cook',
        city: 'Nouméa',
        postal: '98800',
      },
      {
        email: 'luc.fontaine@familles.test',
        name: 'Luc Fontaine',
        first: 'Luc',
        last: 'Fontaine',
        phone: '+687 75 78 90',
        address: '7 Rue de Sébastopol',
        city: 'Dumbéa',
        postal: '98835',
      },
      {
        email: 'isabelle.garnier@familles.test',
        name: 'Isabelle Garnier',
        first: 'Isabelle',
        last: 'Garnier',
        phone: '+687 75 89 01',
        address: '19 Rue de Verdun',
        city: 'Nouméa',
        postal: '98800',
      },
      {
        email: 'thomas.girard@familles.test',
        name: 'Thomas Girard',
        first: 'Thomas',
        last: 'Girard',
        phone: '+687 75 90 12',
        address: '26 Boulevard de la Somme',
        city: 'Mont-Dore',
        postal: '98809',
      },
      {
        email: 'emilie.roux@familles.test',
        name: 'Émilie Roux',
        first: 'Émilie',
        last: 'Roux',
        phone: '+687 75 01 23',
        address: '33 Rue Olry',
        city: 'Nouméa',
        postal: '98800',
      },
    ];

    const parentIds: string[] = [];
    for (const p of parentsData) {
      const user = await createAccount(db, { email: p.email, name: p.name, role: 'PARENT' });
      await db.parent.create({
        data: {
          userId: user.id,
          firstName: p.first,
          lastName: p.last,
          phone: p.phone,
          email: p.email,
          address: p.address,
          city: p.city,
          postalCode: p.postal,
        },
      });
      parentIds.push(user.id);
    }

    const childrenData: ChildData[] = [
      // Parent 1 (3 children)
      {
        first: 'Lucas',
        last: 'Dupont',
        birth: '2015-03-12',
        gender: 'MALE',
        ecole: "École Primaire de l'Anse Vata",
        emergName: 'Martin Dupont',
        emergPhone: '+687 75 12 34',
        emergRelation: 'father',
        parentIndex: 0,
      },
      {
        first: 'Emma',
        last: 'Dupont',
        birth: '2013-07-24',
        gender: 'FEMALE',
        ecole: 'Collège de Magenta',
        emergName: 'Martin Dupont',
        emergPhone: '+687 75 12 34',
        emergRelation: 'father',
        parentIndex: 0,
      },
      {
        first: 'Léa',
        last: 'Dupont',
        birth: '2016-11-08',
        gender: 'FEMALE',
        ecole: 'École Maternelle de la Baie',
        emergName: 'Martin Dupont',
        emergPhone: '+687 75 12 34',
        emergRelation: 'father',
        parentIndex: 0,
      },
      // Parent 2 (3 children)
      {
        first: 'Hugo',
        last: 'Leblanc',
        birth: '2014-05-15',
        gender: 'MALE',
        ecole: 'École Primaire du Receiving',
        emergName: 'Sophie Leblanc',
        emergPhone: '+687 75 23 45',
        emergRelation: 'mother',
        parentIndex: 1,
      },
      {
        first: 'Chloé',
        last: 'Leblanc',
        birth: '2012-09-03',
        gender: 'FEMALE',
        ecole: 'Collège de Tuband',
        emergName: 'Sophie Leblanc',
        emergPhone: '+687 75 23 45',
        emergRelation: 'mother',
        parentIndex: 1,
      },
      {
        first: 'Nathan',
        last: 'Leblanc',
        birth: '2017-01-19',
        gender: 'MALE',
        ecole: 'École Maternelle Foch',
        emergName: 'Sophie Leblanc',
        emergPhone: '+687 75 23 45',
        emergRelation: 'mother',
        parentIndex: 1,
      },
      // Parent 3 (3 children)
      {
        first: 'Mathis',
        last: 'Bernard',
        birth: '2015-06-20',
        gender: 'MALE',
        ecole: 'École Primaire de Dumbéa',
        emergName: 'Jean-Pierre Bernard',
        emergPhone: '+687 75 34 56',
        emergRelation: 'father',
        parentIndex: 2,
      },
      {
        first: 'Manon',
        last: 'Bernard',
        birth: '2013-10-11',
        gender: 'FEMALE',
        ecole: 'Collège de Dumbéa-sur-Mer',
        emergName: 'Jean-Pierre Bernard',
        emergPhone: '+687 75 34 56',
        emergRelation: 'father',
        parentIndex: 2,
      },
      {
        first: 'Théo',
        last: 'Bernard',
        birth: '2016-04-27',
        gender: 'MALE',
        ecole: 'École Maternelle de Koutio',
        emergName: 'Jean-Pierre Bernard',
        emergPhone: '+687 75 34 56',
        emergRelation: 'father',
        parentIndex: 2,
      },
      // Parent 4 (3 children)
      {
        first: 'Inès',
        last: 'Rousseau',
        birth: '2014-08-14',
        gender: 'FEMALE',
        ecole: 'École Primaire de Receiving',
        emergName: 'Claire Rousseau',
        emergPhone: '+687 75 45 67',
        emergRelation: 'mother',
        parentIndex: 3,
      },
      {
        first: 'Tom',
        last: 'Rousseau',
        birth: '2016-12-05',
        gender: 'MALE',
        ecole: 'École Maternelle de la Vallée du Tir',
        emergName: 'Claire Rousseau',
        emergPhone: '+687 75 45 67',
        emergRelation: 'mother',
        parentIndex: 3,
      },
      {
        first: 'Sarah',
        last: 'Rousseau',
        birth: '2012-02-18',
        gender: 'FEMALE',
        ecole: 'Collège du Grand Nouméa',
        emergName: 'Claire Rousseau',
        emergPhone: '+687 75 45 67',
        emergRelation: 'mother',
        parentIndex: 3,
      },
      // Parent 5 (3 children)
      {
        first: 'Louis',
        last: 'Lambert',
        birth: '2015-09-22',
        gender: 'MALE',
        ecole: 'École Primaire du Mont-Dore',
        emergName: 'Pierre Lambert',
        emergPhone: '+687 75 56 78',
        emergRelation: 'father',
        parentIndex: 4,
      },
      {
        first: 'Camille',
        last: 'Lambert',
        birth: '2013-05-30',
        gender: 'FEMALE',
        ecole: 'Collège de Plum',
        emergName: 'Pierre Lambert',
        emergPhone: '+687 75 56 78',
        emergRelation: 'father',
        parentIndex: 4,
      },
      {
        first: 'Jules',
        last: 'Lambert',
        birth: '2017-03-14',
        gender: 'MALE',
        ecole: 'École Maternelle de Yahoué',
        emergName: 'Pierre Lambert',
        emergPhone: '+687 75 56 78',
        emergRelation: 'father',
        parentIndex: 4,
      },
      // Parent 6 (2 children)
      {
        first: 'Gabriel',
        last: 'Moreau',
        birth: '2014-11-28',
        gender: 'MALE',
        ecole: "École Primaire de l'Orphelinat",
        emergName: 'Marie Moreau',
        emergPhone: '+687 75 67 89',
        emergRelation: 'mother',
        parentIndex: 5,
      },
      {
        first: 'Zoé',
        last: 'Moreau',
        birth: '2016-07-09',
        gender: 'FEMALE',
        ecole: 'École Maternelle de Motor Pool',
        emergName: 'Marie Moreau',
        emergPhone: '+687 75 67 89',
        emergRelation: 'mother',
        parentIndex: 5,
      },
      // Parent 7 (2 children)
      {
        first: 'Arthur',
        last: 'Fontaine',
        birth: '2015-02-16',
        gender: 'MALE',
        ecole: 'École Primaire de Koutio',
        emergName: 'Luc Fontaine',
        emergPhone: '+687 75 78 90',
        emergRelation: 'father',
        parentIndex: 6,
      },
      {
        first: 'Alice',
        last: 'Fontaine',
        birth: '2013-08-25',
        gender: 'FEMALE',
        ecole: 'Collège de Dumbéa-sur-Mer',
        emergName: 'Luc Fontaine',
        emergPhone: '+687 75 78 90',
        emergRelation: 'father',
        parentIndex: 6,
      },
      // Parent 8 (2 children)
      {
        first: 'Raphaël',
        last: 'Garnier',
        birth: '2014-04-07',
        gender: 'MALE',
        ecole: 'École Primaire de Montravel',
        emergName: 'Isabelle Garnier',
        emergPhone: '+687 75 89 01',
        emergRelation: 'mother',
        parentIndex: 7,
      },
      {
        first: 'Clara',
        last: 'Garnier',
        birth: '2016-10-13',
        gender: 'FEMALE',
        ecole: 'École Maternelle de Normandie',
        emergName: 'Isabelle Garnier',
        emergPhone: '+687 75 89 01',
        emergRelation: 'mother',
        parentIndex: 7,
      },
      // Parent 9 (2 children)
      {
        first: 'Maxime',
        last: 'Girard',
        birth: '2015-12-01',
        gender: 'MALE',
        ecole: 'École Primaire de Plum',
        emergName: 'Thomas Girard',
        emergPhone: '+687 75 90 12',
        emergRelation: 'father',
        parentIndex: 8,
      },
      {
        first: 'Jade',
        last: 'Girard',
        birth: '2013-03-26',
        gender: 'FEMALE',
        ecole: 'Collège de Plum',
        emergName: 'Thomas Girard',
        emergPhone: '+687 75 90 12',
        emergRelation: 'father',
        parentIndex: 8,
      },
      // Parent 10 (2 children)
      {
        first: 'Adam',
        last: 'Roux',
        birth: '2014-06-17',
        gender: 'MALE',
        ecole: 'École Primaire de Tina',
        emergName: 'Émilie Roux',
        emergPhone: '+687 75 01 23',
        emergRelation: 'mother',
        parentIndex: 9,
      },
      {
        first: 'Lina',
        last: 'Roux',
        birth: '2016-09-04',
        gender: 'FEMALE',
        ecole: 'École Maternelle de la Tranchée',
        emergName: 'Émilie Roux',
        emergPhone: '+687 75 01 23',
        emergRelation: 'mother',
        parentIndex: 9,
      },
    ];

    const childIds: string[] = [];
    for (const c of childrenData) {
      const child = await db.child.create({
        data: {
          firstName: c.first,
          lastName: c.last,
          birthDate: new Date(c.birth),
          gender: c.gender,
          ecole: c.ecole,
          emergencyContactName: c.emergName,
          emergencyContactPhone: c.emergPhone,
          emergencyContactRelation: c.emergRelation,
          medicalInfo: {
            allergies: [],
            medications: [],
            conditions: [],
            diet_restrictions: [],
            notes: '',
          },
        },
      });
      childIds.push(child.id);
      await db.childParent.create({
        data: {
          childId: child.id,
          parentId: parentIds[c.parentIndex],
          isPrimary: true,
          relationship: c.emergRelation,
        },
      });
    }

    for (const setting of [
      { key: 'short_name', value: '"ALVM"' },
      { key: 'city', value: '"Nouméa"' },
      { key: 'postal_code', value: '"98800"' },
      { key: 'country', value: '"Nouvelle-Calédonie"' },
      { key: 'email', value: '"contact@alvm.test"' },
    ])
      await db.appSetting.create({ data: { category: 'organization', ...setting } });
    await db.appSetting.create({
      data: {
        category: 'documents',
        key: 'invoice_footer',
        value: '"Facture à régler dans les 30 jours"',
      },
    });

    const campTypesData = [
      {
        name: 'Multi-activités',
        description: "Camps proposant une variété d'activités sportives, créatives et ludiques",
        accountingCode: '706100',
      },
      {
        name: 'Sport',
        description: 'Camps axés sur une discipline sportive spécifique',
        accountingCode: '706200',
      },
      {
        name: 'Nature & Environnement',
        description: "Découverte de la nature et sensibilisation à l'environnement",
        accountingCode: '706300',
      },
      {
        name: 'Arts & Culture',
        description: 'Activités artistiques et culturelles',
        accountingCode: '706400',
      },
      {
        name: 'Sciences & Technologie',
        description: 'Initiation aux sciences et aux nouvelles technologies',
        accountingCode: '706500',
      },
    ];

    const campTypeIds: Record<string, string> = {};
    for (const ct of campTypesData) {
      const campType = await db.campType.create({ data: { ...ct, active: true } });
      campTypeIds[ct.name] = campType.id;
    }

    const now = new Date();
    const campsData: CampDef[] = [
      {
        name: 'Camp Multi-activités - Vacances de Juillet',
        description:
          'Découvrez nos activités variées: sports, arts créatifs, jeux aquatiques et sorties nature.',
        campType: 'Multi-activités',
        location: "Plage de l'Anse Vata",
        maxCapacity: 30,
        offsetDays: 30,
        durationDays: 5,
        deadlineOffset: 7,
        pricePerDay: 3500,
        status: 'PUBLISHED',
        themes: [
          'Accueil et jeux de cohésion',
          'Sports nautiques',
          'Arts créatifs',
          'Grande sortie nature',
          'Jeux olympiques et spectacle',
        ],
      },
      {
        name: 'Stage Football Intensif',
        description: 'Stage de perfectionnement football avec entraîneurs diplômés.',
        campType: 'Sport',
        location: 'Stade Numa-Daly',
        maxCapacity: 25,
        offsetDays: 45,
        durationDays: 7,
        deadlineOffset: 10,
        pricePerDay: 4000,
        status: 'PUBLISHED',
      },
      {
        name: 'Aventure Nature - Découverte de la faune calédonienne',
        description: 'Randonnées, observation de la faune, ateliers écologie.',
        campType: 'Nature & Environnement',
        location: 'Parc Provincial de la Rivière Bleue',
        maxCapacity: 20,
        offsetDays: 20,
        durationDays: 5,
        deadlineOffset: 5,
        pricePerDay: 3800,
        status: 'PUBLISHED',
      },
      {
        name: 'Atelier Théâtre et Arts Plastiques',
        description: 'Improvisation théâtrale, peinture, sculpture et spectacle de fin de stage.',
        campType: 'Arts & Culture',
        location: 'Centre Culturel Tjibaou',
        maxCapacity: 15,
        offsetDays: 60,
        durationDays: 5,
        deadlineOffset: 14,
        pricePerDay: 4200,
        status: 'PUBLISHED',
      },
      {
        name: 'Camp Robotique et Programmation',
        description: 'Construction de robots, coding, défis technologiques.',
        campType: 'Sciences & Technologie',
        location: 'Université de Nouvelle-Calédonie',
        maxCapacity: 18,
        offsetDays: 75,
        durationDays: 5,
        deadlineOffset: 15,
        pricePerDay: 4500,
        status: 'PUBLISHED',
      },
      {
        name: "Camp Multi-activités - Vacances d'Août",
        description:
          "Sports, jeux, créativité et excursions pour des vacances d'été exceptionnelles!",
        campType: 'Multi-activités',
        location: 'Baie des Citrons',
        maxCapacity: 28,
        offsetDays: 90,
        durationDays: 5,
        deadlineOffset: 20,
        pricePerDay: 3500,
        status: 'PUBLISHED',
      },
      {
        name: 'Stage Natation - Tous niveaux',
        description: 'Perfectionnement natation avec maîtres-nageurs diplômés.',
        campType: 'Sport',
        location: 'Piscine du Mont-Dore',
        maxCapacity: 22,
        offsetDays: 100,
        durationDays: 5,
        deadlineOffset: 21,
        pricePerDay: 3700,
        status: 'PUBLISHED',
      },
      {
        name: 'Exploration Marine - Snorkeling et Écologie',
        description: 'Découverte du lagon: snorkeling, identification des espèces.',
        campType: 'Nature & Environnement',
        location: 'Îlot Maître',
        maxCapacity: 16,
        offsetDays: 120,
        durationDays: 5,
        deadlineOffset: 30,
        pricePerDay: 5000,
        status: 'DRAFT',
      },
      {
        name: 'Stage Danse Hip-Hop et Moderne',
        description: 'Chorégraphies hip-hop et danse moderne. Spectacle de fin de stage.',
        campType: 'Arts & Culture',
        location: 'Studio Danse Nouméa',
        maxCapacity: 20,
        offsetDays: 50,
        durationDays: 5,
        deadlineOffset: 12,
        pricePerDay: 3900,
        status: 'PUBLISHED',
      },
      {
        name: 'Camp Astronomie - Observation des Étoiles',
        description: 'Observation nocturne, planétarium, ateliers scientifiques.',
        campType: 'Sciences & Technologie',
        location: 'Observatoire de Nouméa',
        maxCapacity: 12,
        offsetDays: 150,
        durationDays: 3,
        deadlineOffset: 45,
        pricePerDay: 5500,
        status: 'DRAFT',
      },
    ];

    for (const c of campsData) {
      const startDate = addDays(now, c.offsetDays);
      const camp = await db.camp.create({
        data: {
          name: c.name,
          description: c.description,
          campTypeId: campTypeIds[c.campType],
          location: c.location,
          maxCapacity: c.maxCapacity,
          startDate,
          endDate: addDays(startDate, c.durationDays - 1),
          registrationDeadline: addDays(startDate, -c.deadlineOffset),
          pricePerDay: c.pricePerDay,
          totalPrice: c.pricePerDay * c.durationDays,
          status: c.status,
          createdBy: staffIds[0],
        },
      });
      for (let d = 0; d < c.durationDays; d++)
        await db.campDay.create({
          data: { campId: camp.id, date: addDays(startDate, d), theme: c.themes?.[d] ?? null },
        });
    }

    const publishedCamps = await db.camp.findMany({
      where: { status: 'PUBLISHED' },
      select: { id: true, days: { orderBy: { date: 'asc' }, select: { id: true } } },
      orderBy: { startDate: 'asc' },
    });
    let registrations = 0;
    for (let i = 0; i < childIds.length; i++) {
      const link = await db.childParent.findFirst({
        where: { childId: childIds[i], isPrimary: true },
        select: { parentId: true },
      });
      if (!link) continue;
      const first = publishedCamps[i % publishedCamps.length];
      const second = publishedCamps[(i + 1) % publishedCamps.length];
      for (const [camp, days] of [
        [first, first.days.slice(0, 3)],
        [second, second.days],
      ] as const) {
        await db.registration.create({
          data: {
            campId: camp.id,
            childId: childIds[i],
            parentId: link.parentId,
            status: 'PENDING',
            paymentStatus: 'UNPAID',
            selectedDays: days.map((d) => d.id),
          },
        });
        registrations++;
      }
    }
    console.log(
      `   ✓ alvm : 3 personnels, ${parentIds.length} parents, ${childIds.length} enfants, ${campsData.length} camps, ${registrations} inscriptions`,
    );
  });
}

async function seedAssoDemo(organizationId: string) {
  await withDbContext({ scope: 'tenant', organizationId }, async (db) => {
    // Même adresse qu'un parent d'« alvm » : compte distinct, invisible depuis alvm.
    const user = await createAccount(db, {
      email: 'martin.dupont@familles.test',
      name: 'Martin Dupont (asso-demo)',
      role: 'PARENT',
    });
    await db.parent.create({
      data: {
        userId: user.id,
        firstName: 'Martin',
        lastName: 'Dupont',
        phone: '+687 70 00 00',
        email: 'martin.dupont@familles.test',
        address: '1 rue de la Démo',
        city: 'Koné',
        postalCode: '98860',
      },
    });
    const child = await db.child.create({
      data: {
        firstName: 'Paul',
        lastName: 'Dupont',
        birthDate: new Date('2016-02-02'),
        gender: 'MALE',
      },
    });
    await db.childParent.create({
      data: { childId: child.id, parentId: user.id, isPrimary: true, relationship: 'father' },
    });
    const campType = await db.campType.create({ data: { name: 'Multi-activités', active: true } });
    const admin = await db.user.findFirstOrThrow({
      where: { role: 'ADMIN' },
      select: { id: true },
    });
    const start = addDays(new Date(), 40);
    const camp = await db.camp.create({
      data: {
        name: 'Stage découverte — Koné',
        description: 'Stage de démonstration de l’association asso-demo.',
        campTypeId: campType.id,
        location: 'Koné',
        maxCapacity: 12,
        startDate: start,
        endDate: addDays(start, 2),
        registrationDeadline: addDays(start, -7),
        pricePerDay: 3000,
        totalPrice: 9000,
        status: 'PUBLISHED',
        createdBy: admin.id,
      },
    });
    for (let d = 0; d < 3; d++)
      await db.campDay.create({ data: { campId: camp.id, date: addDays(start, d) } });
    console.log('   ✓ asso-demo : 1 parent, 1 enfant, 1 camp');
  });
}

async function main() {
  console.log('🌱 Seed de démonstration multi-tenant\n');
  const passwordHash = await hash(PASSWORD, 12);
  const superAdminId = await ensurePlatform(passwordHash);
  console.log('   ✓ plateforme : superadmin@plateforme.test');

  const alvm = await ensureOrganization(superAdminId, {
    slug: 'alvm',
    name: 'ALVM (démonstration)',
    adminEmail: 'admin@alvm.test',
    adminName: 'Admin ALVM',
  });
  if (alvm) await seedAlvm(alvm);

  const demo = await ensureOrganization(superAdminId, {
    slug: 'asso-demo',
    name: 'Association Démo',
    adminEmail: 'admin@asso-demo.test',
    adminName: 'Admin Démo',
  });
  if (demo) await seedAssoDemo(demo);

  console.log(
    `\n✅ Terminé. Mot de passe de tous les comptes : ${process.env.SEED_PASSWORD ? '(SEED_PASSWORD)' : PASSWORD}`,
  );
  console.log('   Connexion : /auth/signin (espace « alvm » ou « asso-demo »), /auth/super-admin');
}

main()
  .catch((error) => {
    console.error('❌ Seed :', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
