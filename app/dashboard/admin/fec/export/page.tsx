'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Download, FileText, Loader2, Info } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';

const fecExportSchema = z.object({
  startDate: z.string().min(1, 'Date de début requise'),
  endDate: z.string().min(1, 'Date de fin requise'),
  siren: z.string().optional(),
});

type FECExportFormData = z.infer<typeof fecExportSchema>;

export default function FECExportPage() {
  const [error, setError] = useState<string | null>(null);
  const [exportStats, setExportStats] = useState<{
    count: number;
    totalDebit: number;
    totalCredit: number;
    balance: number;
  } | null>(null);

  const generateFECMutation = trpc.fec.generateFEC.useMutation();

  const form = useForm<FECExportFormData>({
    resolver: zodResolver(fecExportSchema),
    defaultValues: {
      startDate: '',
      endDate: '',
      siren: '',
    },
  });

  function downloadFEC(content: string, filename: string) {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }

  async function onSubmit(values: FECExportFormData) {
    try {
      setError(null);
      setExportStats(null);

      const result = await generateFECMutation.mutateAsync({
        startDate: values.startDate,
        endDate: values.endDate,
        siren: values.siren,
      });

      setExportStats({
        count: result.entryCount,
        totalDebit: result.totalDebit,
        totalCredit: result.totalCredit,
        balance: result.balance,
      });

      // Télécharger le fichier FEC
      downloadFEC(result.content, result.filename);
    } catch (err: any) {
      setError(err.message || 'Une erreur est survenue lors de l\'export');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Export Comptable FEC"
        description="Génération du fichier FEC (Fichier des Écritures Comptables)"
      />

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          <strong>Format FEC :</strong> Le fichier généré est conforme au standard français FEC pour l'export
          des écritures comptables. Il peut être importé dans tout logiciel comptable compatible.
        </AlertDescription>
      </Alert>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {exportStats && (
        <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
          <FileText className="h-4 w-4 text-green-600" />
          <AlertDescription>
            <strong>Export réussi !</strong> {exportStats.count} écritures exportées.
            <br />
            Total débits : {exportStats.totalDebit.toLocaleString('fr-FR')} XPF
            <br />
            Total crédits : {exportStats.totalCredit.toLocaleString('fr-FR')} XPF
            <br />
            Balance : {(exportStats.totalDebit - exportStats.totalCredit).toLocaleString('fr-FR')} XPF
          </AlertDescription>
        </Alert>
      )}

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Paramètres d'export</CardTitle>
          <CardDescription>
            Sélectionnez la période comptable à exporter
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="startDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date de début</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="endDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date de fin</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="siren"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SIREN (optionnel)</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: 123456789" {...field} />
                    </FormControl>
                    <FormDescription>
                      Numéro SIREN de l'organisation (9 chiffres)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" disabled={generateFECMutation.isPending} className="w-full">
                {generateFECMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Génération en cours...
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-4 w-4" />
                    Générer et télécharger le fichier FEC
                  </>
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>À propos du format FEC</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            Le FEC (Fichier des Écritures Comptables) est un format standardisé obligatoire en France
            pour l'export des données comptables.
          </p>
          <p>
            <strong>Structure du fichier :</strong>
          </p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>Format : Texte CSV avec séparateur pipe (|)</li>
            <li>Encodage : UTF-8</li>
            <li>Une ligne = une écriture comptable (débit OU crédit)</li>
            <li>Colonnes obligatoires : Journal, Date, Compte, Montant, etc.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
