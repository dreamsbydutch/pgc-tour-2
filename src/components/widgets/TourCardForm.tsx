"use client";

import { Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { type Doc } from "@/convex";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  MemberNameWithBadges,
  DialogTitle,
} from "@/ui";
import {
  cn,
  formatMoney,
  formatMonthDay,
  getMemberDisplayName,
} from "@/utils/app";
import { SeasonDoc, TourCardDoc } from "convex/types/types";
import { useTourCardChange, useTourCardRegistration } from "@/hooks";
import type { TourRegistrationOption } from "@/types";
import { DEFAULT_MAX_PARTICIPANTS } from "@/utils/constants";

/**
 * TourCardForm
 *
 * Displays the “choose a tour” UI for the currently signed-in member.
 *
 * Data sources:
 * - Clerk: derives the acting `clerkId` from `useUser()`.
 * - Convex:
 *   - `seasons.getCurrentSeason` to scope everything to the active season.
 *   - `tours.getTours` to list tours in the current season.
 *   - `tourCards.getTourCards` to compute per-tour spots remaining and detect if the member already has a tour card.
 *   - `members.getCurrentMember` to resolve the authenticated member.
 *   - `transactions.getTransactions` to detect whether the Tour Card Fee is already paid.
 *
 * Major render states:
 * - Signed out: returns `null`.
 * - Loading: renders `TourCardFormSkeleton`.
 * - Hidden: returns `null` when the season is missing, tours are missing, or the member already has a tour card.
 * - Ready: renders selectable tour options via `TourCardFormButton`.
 *
 * @returns A tour-selection UI fragment or `null`.
 *
 * @example
 * <TourCardForm />
 */
export function TourCardForm({
  currentSeason,
  tours,
  member,
  seasonTourCards,
}: {
  currentSeason: SeasonDoc;
  tours: Doc<"tours">[];
  member: Doc<"members"> | null;
  seasonTourCards: TourCardDoc[];
}) {
  const registration = useTourCardRegistration({
    currentSeason,
    tours,
    member,
    seasonTourCards,
  });

  if (registration.state === "signed_out" || member === null) return null;

  if (registration.state === "registered" && registration.currentTourCard) {
    return (
      <TourCardOutput
        key={member._id}
        tours={registration.toursWithMeta}
        season={currentSeason}
        member={member}
        currentTourCard={registration.currentTourCard}
        closesAt={registration.closesAt}
        majorChampionBadgesByMemberId={
          registration.majorChampionBadgesByMemberId
        }
      />
    );
  }

  return (
    <div className="my-4 flex flex-col items-center justify-center gap-4">
      <h2 className="text-center font-varela text-lg text-slate-600">
        {`Choose your Tour for the ${currentSeason.year} season below.`}
      </h2>
      <div className="flex h-full flex-col gap-2 sm:flex-row">
        {registration.toursWithMeta.map((tour) => (
          <TourCardFormButton
            key={tour.tour._id}
            tour={tour}
            isCreating={registration.creatingTourId === String(tour.tour._id)}
            isDisabled={
              registration.creatingTourId !== null || tour.spotsRemaining <= 0
            }
            hasEffect={registration.effectTourId === String(tour.tour._id)}
            onAnimationEnd={registration.clearEffect}
            onRegister={() => void registration.register(tour)}
          />
        ))}
      </div>
      {registration.error ? (
        <p role="alert" className="text-sm text-red-700">
          {registration.error}
        </p>
      ) : null}
      <div className="text-center font-varela text-base text-slate-600">
        Coordinate with your friends to make sure you sign up for the same tour
        for the best experience. For more info on the PGC Tour, check out the{" "}
        <Link to="/rulebook" search={{}} className="underline">
          Rulebook.
        </Link>
      </div>
    </div>
  );
}

/**
 * TourCardOutput
 *
 * Displays the signed-in member’s current tour card (name + tour branding), shows remaining
 * spots for that tour, and provides a CTA to change tours.
 *
 * Data sources:
 * - Clerk: current user (`useUser`) for identity and display fallback.
 * - Convex:
 *   - `tourCards.getCurrentYearTourCard` (by clerkId + year) to load the member’s current-year tour card
 *   - authenticated member data for account balance
 *   - `tours.getTours` (by tourId, enhanced with season) for tour/season display
 *   - `tourCards.getTourCards` (by tourId + seasonId) to derive remaining capacity
 *
 * Major render states:
 * - While auth/data is loading: renders an internal skeleton.
 * - If the user is not signed in or has no tour card: renders `null`.
 * - Otherwise: renders the tour card, spots remaining, and the change-tour CTA.
 *
 * @returns The tour card UI or `null` when unavailable.
 *
 * @example
 * <TourCardOutput />
 */
function TourCardOutput(props: {
  tours?: TourRegistrationOption[];
  season: SeasonDoc;
  member: Doc<"members">;
  currentTourCard: TourCardDoc;
  closesAt: number | null;
  majorChampionBadgesByMemberId: Record<
    string,
    Array<{
      tournamentId: string;
      tournamentName: string;
      logoUrl: string | null;
    }>
  >;
}) {
  const currentTour = props.tours?.find(
    (t) => t.tour._id === props.currentTourCard.tourId,
  );
  if (!currentTour) return null;
  const spotsRemaining = currentTour.spotsRemaining;
  return (
    <div className="mt-2 flex flex-col items-center justify-center">
      <h2 className="max-w-xl text-center font-varela text-lg text-slate-600">
        {`You have secured your spot on the ${currentTour.tour.name}. The ${props.season.year} season will begin with the Waste Management Open on ${formatMonthDay(props.season.startDate)}.`}
      </h2>
      <div className="mx-auto mt-4 flex w-[12rem] min-w-fit flex-col items-center justify-center rounded-lg border-2 border-gray-400 bg-gray-300 p-4 text-center shadow-2xl 2xs:w-[18rem] sm:w-[22rem]">
        <img
          src={currentTour.tour.logoUrl}
          alt="Tour Logo"
          width={75}
          height={75}
          loading="lazy"
          className="h-3/4 max-h-32 w-3/4 max-w-32 object-contain"
        />
        <h2 className="text-2xl font-bold text-gray-800">
          <MemberNameWithBadges
            name={getMemberDisplayName(props.member, undefined)}
            badges={
              props.majorChampionBadgesByMemberId[String(props.member._id)]
            }
          />
        </h2>
        <p className="text-base italic text-gray-600">
          {currentTour.tour.name}
        </p>
      </div>
      <div className="mb-2 mt-2 text-xs text-slate-600">
        {spotsRemaining === 0
          ? `${currentTour.tour.name} is full!`
          : `${spotsRemaining} spots remaining`}
      </div>
      {props.tours && (
        <TourCardChangeButton
          currentSeason={props.season}
          tours={props.tours}
          currentTourCard={props.currentTourCard}
          closesAt={props.closesAt}
        />
      )}
      {props.member && props.member.account < 0 && (
        <div className="mb-2 max-w-2xl rounded-md border border-red-200 bg-red-50 px-3 py-2 text-center text-sm text-red-800">
          {`You currently owe ${formatMoney(Math.abs(props.member.account), true)}. Please send payment to puregolfcollectivetour@gmail.com before the start of the next tournament to make picks.`}
        </div>
      )}
    </div>
  );
}

/**
 * TourCardChangeButton
 *
 * Renders a “Switch Tours” button that opens a dialog for selecting a new tour and updates the
 * existing tour card’s `tourId`.
 *
 * Data sources:
 * - Convex:
 *   - `tourCards.getTourCards({ id })` to load the current tour card.
 *   - `tours.getTours({ seasonId })` to list tours in that season.
 *   - `tourCards.getTourCards({ seasonId })` to compute per-tour capacity.
 *   - `tourCards.switchTourCards` mutation to perform the switch.
 *   - `tourCards.deleteTourCardAndFee` mutation to remove the tour card and related fee.
 *
 * Major render states:
 * - `loading` prop: renders a local skeleton.
 * - Default: renders the button and dialog flow.
 *
 * Capacity handling:
 * - The UI shows full tours as disabled.
 * - Server-side capacity validation is still enforced by `tourCards.switchTourCards`.
 *
 * @param props - Component props.
 * @param props.tourCardId - The tour card document id to update.
 * @returns The switch-tours button and dialog UI.
 */
function TourCardChangeButton({
  currentSeason,
  tours,
  currentTourCard,
  closesAt,
}: {
  currentSeason: SeasonDoc;
  tours: {
    tour: Doc<"tours">;
    tourCards: TourCardDoc[];
    registeredCount: number;
  }[];
  currentTourCard: TourCardDoc;
  closesAt: number | null;
}) {
  const {
    isLoading,
    effect,
    setEffect,
    confirmEffect,
    setConfirmEffect,
    isModalOpen,
    setIsModalOpen,
    errorMessage,
    setErrorMessage,
    selectedTourId,
    setSelectedTourId,
    handleButtonClick,
    handleSwitch,
    handleRemoveTourCard,
    isSelfServiceOpen,
    closesAtLabel,
    closedMessage,
  } = useTourCardChange({ currentSeason, currentTourCard, closesAt });

  return (
    <>
      <Button
        className={[
          effect && "animate-toggleClick",
          "mx-auto mb-2 mt-0.5 h-[1.5rem] w-1/2 max-w-[150px] xs:w-2/5 sm:w-1/3",
        ]
          .filter(Boolean)
          .join(" ")}
        onAnimationEnd={() => setEffect(false)}
        variant="destructive"
        onClick={handleButtonClick}
        disabled={!isSelfServiceOpen || isLoading}
      >
        Switch Tours
      </Button>

      <div className="mb-2 text-center text-xs text-slate-600">
        {isSelfServiceOpen
          ? closesAtLabel
            ? `Changes close ${closesAtLabel}.`
            : "Tour card changes are currently open."
          : closedMessage}
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="w-full">
          {isLoading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Switch Tours</DialogTitle>
                <DialogDescription>
                  Choose a new tour with open spots. Your existing Tour Card
                  will be updated to the new tour.
                </DialogDescription>
              </DialogHeader>

              {isLoading ? (
                <div className="flex items-center justify-center p-6">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : !currentTourCard ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  Tour card not found.
                </div>
              ) : tours.filter((t) => t.tour._id !== currentTourCard.tourId)
                  .length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  No other tours are available for this season.
                </div>
              ) : (
                <div className="flex flex-col gap-2 py-2">
                  {tours
                    .filter((t) => t.tour._id !== currentTourCard.tourId)
                    .map((t) => {
                      const spotsRemaining =
                        +(t.tour.maxParticipants ?? DEFAULT_MAX_PARTICIPANTS) -
                        t.registeredCount;
                      const isFull = spotsRemaining <= 0;
                      const isSelected = selectedTourId === t.tour._id;
                      return (
                        <button
                          key={t.tour._id}
                          type="button"
                          onClick={() => {
                            if (isFull) return;
                            setSelectedTourId(t.tour._id);
                          }}
                          disabled={isFull}
                          className={
                            isFull
                              ? "cursor-not-allowed rounded-md border border-slate-200 bg-slate-50 p-3 text-left opacity-60"
                              : isSelected
                                ? "rounded-md border border-slate-300 bg-slate-100 p-3 text-left"
                                : "rounded-md border border-slate-200 bg-white p-3 text-left hover:bg-slate-50"
                          }
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              {t.tour.logoUrl ? (
                                <img
                                  src={t.tour.logoUrl}
                                  alt={`${t.tour.name} logo`}
                                  width={32}
                                  height={32}
                                  loading="lazy"
                                  className="h-8 w-8 object-contain"
                                />
                              ) : (
                                <div className="h-8 w-8 rounded bg-gray-200" />
                              )}
                              <div>
                                <div className="text-sm font-semibold text-slate-800">
                                  {t.tour.name}
                                </div>
                                <div className="text-xs text-slate-600">
                                  {isFull
                                    ? "Tour is full"
                                    : `${spotsRemaining} spots remaining`}
                                  {t.tour.buyIn
                                    ? ` • Buy-in: ${formatMoney(t.tour.buyIn, false)}`
                                    : ""}
                                </div>
                              </div>
                            </div>
                            <div
                              className={
                                isFull
                                  ? "text-xs font-semibold text-slate-500"
                                  : isSelected
                                    ? "text-xs font-semibold text-slate-900"
                                    : "text-xs text-slate-500"
                              }
                            >
                              {isFull
                                ? "FULL"
                                : isSelected
                                  ? "Selected"
                                  : "Select"}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                </div>
              )}

              {errorMessage ? (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {errorMessage}
                </div>
              ) : null}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsModalOpen(false);
                    setSelectedTourId(null);
                    setErrorMessage(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleRemoveTourCard}
                  disabled={!isSelfServiceOpen || isLoading}
                >
                  Remove Tour Card
                </Button>
                <Button
                  type="button"
                  onClick={handleSwitch}
                  disabled={
                    !selectedTourId ||
                    !isSelfServiceOpen ||
                    isLoading ||
                    tours.filter((t) => t.tour._id !== currentTourCard.tourId)
                      .length === 0
                  }
                  className={confirmEffect ? "animate-toggleClick" : ""}
                  onAnimationEnd={() => setConfirmEffect(false)}
                >
                  Confirm Switch
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * TourCardFormButton
 *
 * Renders a single selectable “tour card” option used by `TourCardForm`.
 *
 * Data sources:
 * - Convex mutation: `tourCards.createMyTourCard`.
 *
 * Major render states:
 * - `loading`: renders a local skeleton matching the button size.
 * - Otherwise: renders a clickable button that creates a tour card for the selected tour.
 *
 * Behavior:
 * - Disabled when `spotsRemaining <= 0`.
 * - Also disabled while any tour card is being created (shared parent state) or while this
 *   specific button is in-flight.
 *
 * @param props - Component props.
 * @returns A button-like card for selecting a tour, or a skeleton when loading.
 *
 * @example
 * <TourCardFormButton
 *   tour={tour}
 *   spotsRemaining={12}
 *   seasonId={seasonId}
 *   memberDisplayName={memberDisplayName}
 *   buyInLabel={"$250"}
 *   isCreatingTourCard={isCreatingTourCard}
 *   setIsCreatingTourCard={setIsCreatingTourCard}
 * />
 */
function TourCardFormButton(props: {
  tour: TourRegistrationOption;
  isCreating: boolean;
  isDisabled: boolean;
  hasEffect: boolean;
  onAnimationEnd: () => void;
  onRegister: () => void;
}) {
  return (
    <Button
      type="button"
      variant="secondary"
      onClick={props.onRegister}
      disabled={props.isDisabled}
      className={cn(
        props.hasEffect && "animate-toggleClick",
        "flex h-[16rem] w-[14rem] flex-col items-center justify-center border-2 p-2 text-lg shadow-lg",
      )}
      onAnimationEnd={props.onAnimationEnd}
    >
      {props.isCreating ? (
        <Loader2 className="h-6 w-6 animate-spin text-gray-700" />
      ) : (
        <>
          {typeof props.tour.tour.logoUrl === "string" &&
          props.tour.tour.logoUrl ? (
            <img
              src={props.tour.tour.logoUrl}
              alt={`${props.tour.tour.name} logo`}
              width={128}
              height={128}
              loading="lazy"
              className="w-4/5 object-contain"
            />
          ) : (
            <div className="mb-2 h-28 w-28 rounded bg-gray-200" />
          )}
          <span className="mt-2 text-center text-base font-semibold">
            {props.tour.tour.name}
          </span>
          <div className="text-xs text-slate-600">
            {props.tour.spotsRemaining <= 0
              ? `${props.tour.tour.name} is full!`
              : `${props.tour.spotsRemaining} spots remaining`}
          </div>
          <div className="text-xs text-slate-600">{`Buy-in: ${formatMoney(props.tour.tour.buyIn, false)}`}</div>
        </>
      )}
    </Button>
  );
}

/**
 * useTourCardFormButton
 *
 * Owns the “create tour card” mutation flow and derives UI state for `TourCardFormButton`.
 *
 * @param input - Hook inputs.
 * @param input.tourId - The tour being selected.
 * @param input.spotsRemaining - Remaining capacity; disables when `<= 0`.
 * @param input.seasonId - Season id to associate with the created tour card.
 * @param input.memberDisplayName - Display name stored on the created tour card.
 * @param input.isCreatingTourCard - Shared parent flag used to disable sibling buttons.
 * @param input.setIsCreatingTourCard - Setter for the shared parent flag.
 * @returns UI state and handlers for the button.
 */
